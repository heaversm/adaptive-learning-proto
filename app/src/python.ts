// Python in the browser via Pyodide (loaded from CDN in index.html).
// A custom runner, not JupyterLite, so the app sees every run, error and line number.

declare global {
  interface Window {
    loadPyodide: (opts?: object) => Promise<any>;
  }
}

export type RunResult = {
  stdout: string;
  html: string | null;
  text: string | null;
  images: string[]; // base64 PNG
  error: string | null;
  line: number | null;
};

const HELPER = `
import io, base64, json, traceback, warnings
import matplotlib
matplotlib.use("AGG")
import matplotlib.pyplot as plt
from pyodide.code import eval_code
warnings.filterwarnings("ignore", message=".*non-interactive.*")
warnings.filterwarnings("ignore", category=DeprecationWarning)
_G = {"__name__": "__main__"}

def _run(src):
    out = {"html": None, "text": None, "images": [], "error": None, "line": None}
    try:
        val = eval_code(src, _G, filename="<cell>")
        if val is not None:
            if hasattr(val, "_repr_html_"):
                out["html"] = val._repr_html_()
            else:
                out["text"] = repr(val)
    except BaseException as e:
        frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "<cell>"]
        out["line"] = frames[-1].lineno if frames else getattr(e, "lineno", None)
        out["error"] = "".join(traceback.format_exception_only(type(e), e)).strip()
    for n in plt.get_fignums():
        buf = io.BytesIO()
        plt.figure(n).savefig(buf, format="png", dpi=110, bbox_inches="tight")
        out["images"].append(base64.b64encode(buf.getvalue()).decode())
    plt.close("all")
    return json.dumps(out)

def _reset():
    _G.clear()
    _G["__name__"] = "__main__"
`;

let pyodide: any = null;
let loading: Promise<void> | null = null;

export function loadPython(onStatus: (s: string) => void): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    onStatus("loading Python…");
    pyodide = await window.loadPyodide();
    onStatus("loading pandas, scipy, matplotlib…");
    await pyodide.loadPackage(["numpy", "pandas", "matplotlib", "scipy"]);
    pyodide.runPython(HELPER);
    onStatus("ready");
  })();
  return loading;
}

export function writeFile(name: string, text: string) {
  pyodide.FS.writeFile(name, text);
}

export function resetKernel() {
  pyodide?.globals.get("_reset")();
}

export function runCell(code: string): RunResult {
  let stdout = "";
  pyodide.setStdout({ batched: (s: string) => (stdout += s + "\n") });
  pyodide.setStderr({ batched: (s: string) => (stdout += s + "\n") });
  const json = pyodide.globals.get("_run")(code) as string;
  return { stdout, ...JSON.parse(json) };
}
