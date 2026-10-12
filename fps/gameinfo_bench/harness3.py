"""Restarted Deadlock R3 benchmarks; stdlib only, Python 3.12 on Windows.

--plan performs no writes, subprocesses or Windows API calls; optional cfgs are read for hashes.
VConsole is authorized only for local demo playback (-insecure, never matchmaking).
"""
import argparse
import csv
import ctypes
import ctypes.wintypes as wt
import hashlib
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import statistics
import subprocess
import sys
import time
from datetime import datetime

# Run folders are large and machine-specific: keep them out of git.
BENCH = Path(os.environ.get("GAMEINFO_BENCH_RUNS")
             or Path(__file__).resolve().parents[2] / ".scratch" / "gameinfo_opt" / "runs")
GAME = Path("G:/SteamLibrary/steamapps/common/Deadlock/game/citadel")
GI = GAME / "gameinfo.gi"
LOG = GAME / "console.log"
CFG = GAME / "cfg"
VCON = "C:/Users/Administrator/Desktop/vcon.py"
LAUNCH = 'cmd /c ""C:\\Users\\Administrator\\Desktop\\dead.bat" -windowed -res 1600x900 -vconsole -insecure +exec bench_r3"'
DEMO = "110239551"
TICK = 138245
START_CFG = "// Generated R3 local-demo benchmark startup. No performance settings.\ncvar_unhide\necho R3_CFG_READY\n"
VALUE_CFG = "// Generated R3 effective-value dump; names are bare queries, not setters.\necho R3_VALUES_BEGIN\n{queries}echo R3_VALUES_END\n"
METRICS = ("fps", "cpu_cores", "globpool_cores", "main_cores", "render_cores",
           "frame_active_avg_ms", "frame_active_p99_ms", "frame_active_p99_fps_proxy",
           "client_render_active_p99_ms")


def arm_cfgs(args):
    return {"dump": args.cfg} if args.mode == "dump" else {"A": args.a_cfg, "B": args.b_cfg}


def safe_launch_args(value):
    tokens = value.split()
    # This string goes through cmd and the launcher's PowerShell tokenization.
    # Reject quotes, shell operators/expansions and other nonliteral tokens.
    if any(not re.fullmatch(r"[A-Za-z0-9_./:\\+=,-]+", token) for token in tokens):
        raise argparse.ArgumentTypeError("extra launch arguments must be literal tokens (no quotes or shell metacharacters)")
    return " ".join(tokens)


def arm_args(args):
    return {"dump": args.args} if args.mode == "dump" else {"A": args.a_args, "B": args.b_args}


def valid_order(order):
    return bool(order) and len(order) % 2 == 0 and all(
        set(order[index:index + 2]) == {"A", "B"} for index in range(0, len(order), 2))


def cfg_target(path):
    name = path.name
    reserved = {"auto.cfg", "autoexec.cfg", "launcher.cfg", "bench_r3.cfg", "bench_r3_values.cfg"}
    if (path.suffix.lower() != ".cfg" or not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9-]*", path.stem)
            or name.lower() in reserved):
        raise ValueError(f"extra cfg requires a safe, non-launcher-owned .cfg basename: {name!r}")
    return CFG / name


def launch_command(extra_cfg=None, extra_args=""):
    suffix = f" +exec {extra_cfg.stem}" if extra_cfg is not None else ""
    extra_args = safe_launch_args(extra_args)
    if extra_args:
        suffix += " " + extra_args
    return LAUNCH[:-1] + suffix + '"'


def vcon(*commands, timeout=30, reply_path=None):
    """Use the existing nonce-delimited desktop client, not a new protocol client."""
    result = subprocess.run(["py", VCON, "--timeout", str(timeout), *commands],
                            capture_output=True, text=True, timeout=timeout + 30)
    if reply_path is not None:
        reply_path.write_text(result.stdout, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"vcon failed ({result.returncode}): {result.stdout}\n{result.stderr}")
    return result.stdout


def game_pids():
    result = subprocess.run(["tasklist", "/fi", "imagename eq deadlock.exe", "/fo", "csv", "/nh"],
                            capture_output=True, text=True, timeout=15, check=True)
    return [int(row[1]) for row in csv.reader(io.StringIO(result.stdout))
            if len(row) > 1 and row[0].lower() == "deadlock.exe"]


def kill_game():
    if not game_pids():
        return
    subprocess.run(["taskkill", "/im", "deadlock.exe"], capture_output=True, timeout=20)
    deadline = time.monotonic() + 14
    while game_pids() and time.monotonic() < deadline:
        time.sleep(0.5)
    if game_pids():
        subprocess.run(["taskkill", "/f", "/im", "deadlock.exe"], capture_output=True, timeout=20)
    deadline = time.monotonic() + 20
    while game_pids():
        if time.monotonic() >= deadline:
            raise RuntimeError("deadlock.exe did not exit; refusing to launch a second instance")
        time.sleep(0.5)


class LogTail:
    """Read only this launch's bytes, including truncate/recreate-on-launch logs."""
    def __init__(self, path=LOG):
        self.path = path
        self.data = bytearray()
        self.offset = path.stat().st_size if path.exists() else 0
        self.anchor = self._anchor(self.offset)
        self.resets = 0

    def _anchor(self, offset):
        try:
            with self.path.open("rb") as stream:
                stream.seek(max(0, offset - 128))
                return stream.read(min(128, offset))
        except FileNotFoundError:
            return b""

    def read(self):
        try:
            with self.path.open("rb") as stream:
                stream.seek(0, 2)
                size = stream.tell()
                stream.seek(max(0, self.offset - 128))
                anchor = stream.read(min(128, self.offset))
                if size < self.offset or anchor != self.anchor:
                    self.offset = 0
                    self.resets += 1
                stream.seek(self.offset)
                chunk = stream.read()
                self.offset += len(chunk)
                self.data.extend(chunk)
                stream.seek(max(0, self.offset - 128))
                self.anchor = stream.read(min(128, self.offset))
        except FileNotFoundError:
            pass
        return self.data.decode("utf-8", "replace")

    def mark(self):
        self.read()
        return len(self.data)

    def segment(self, start=0):
        self.read()
        return self.data[start:].decode("utf-8", "replace")

    def save(self, path):
        self.read()
        path.write_bytes(self.data)


def wait_log(tail, pattern, start=0, timeout=180):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        text = tail.segment(start)
        if re.search(pattern, text, re.I):
            return text
        time.sleep(0.25)
    raise TimeoutError(f"console.log did not match {pattern!r} in {timeout}s")


def parse_seg(segment):
    """Parse observed VProfLite Avg/P99 and active-frame/1s-max columns."""
    offset = segment.rfind("-- Performance report --")
    if offset < 0:
        raise ValueError("missing VProfLite performance report")
    text = segment[offset:]
    summary = re.search(r"Summary of (\d+) frames and (\d+) 1-second", text)
    if not summary:
        raise ValueError("missing VProfLite summary")
    rows = {}
    for line in text.splitlines():
        line = re.sub(r"^.*?\[VProf\]\s*", "", line)
        match = re.match(r"^\s*(.*?)\s+((?:\d+(?:\.\d+)?\s+){9}\d+(?:\.\d+)?)\s*$", line)
        if not match:
            continue
        values = match[2].split()
        rows[match[1].strip()] = dict(
            avg=float(values[0]), p99=float(values[1]), n=int(values[2]),
            aavg=float(values[3]), ap99=float(values[4]),
            s50=float(values[5]), s95=float(values[6]), intervals=int(values[7]),
            as50=float(values[8]), as95=float(values[9]))
    if not all(key in rows for key in ("FrameTotal", "Client Rendering")):
        raise ValueError("incomplete report: FrameTotal/Client Rendering required")
    fps = re.search(r"FPS: Avg=([\d.]+), P1=([\d.]+)", text)
    frames, intervals = map(int, summary.groups())
    # 6774 VProfLite omits the Present_RenderDevice row; fall back to FrameTotal samples.
    present_row = rows.get("Present_RenderDevice") or rows["FrameTotal"]
    present = present_row["n"]
    ratio = frames / present if present else None
    return dict(frames=frames, intervals=intervals, present_n=present, rows=rows,
                reported_fps_avg=float(fps[1]) if fps else None,
                reported_fps_p1=float(fps[2]) if fps else None,
                frame_to_present_ratio=ratio,
                doubled_frame_count=bool(ratio and 1.7 <= ratio <= 2.3))


def report(tail):
    start = tail.mark()
    reply = vcon("engine_frametime_print_report", timeout=60)
    if "-- Performance report --" in reply:
        return parse_seg(reply), reply, reply
    # Some profiler channels also write the launch log. Only fall back when the
    # issuing connection has no report, then wait for a quiet complete log block.
    wait_log(tail, r"-- Performance report --", start, 30)
    deadline = time.monotonic() + 10
    previous = -1
    quiet_since = time.monotonic()
    while time.monotonic() < deadline:
        tail.read()
        if len(tail.data) != previous:
            previous = len(tail.data)
            quiet_since = time.monotonic()
        if time.monotonic() - quiet_since >= 0.5:
            break
        time.sleep(0.1)
    segment = tail.segment(start)
    return parse_seg(segment), segment, reply


class FT(ctypes.Structure):
    _fields_ = [("lo", wt.DWORD), ("hi", wt.DWORD)]


class THREADENTRY32(ctypes.Structure):
    _fields_ = [("dwSize", wt.DWORD), ("cntUsage", wt.DWORD), ("th32ThreadID", wt.DWORD),
                ("th32OwnerProcessID", wt.DWORD), ("tpBasePri", wt.LONG),
                ("tpDeltaPri", wt.LONG), ("dwFlags", wt.DWORD)]


class CpuSampler:
    def __init__(self):
        self.k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k = self.k32
        k.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
        k.OpenProcess.restype = wt.HANDLE
        k.OpenThread.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
        k.OpenThread.restype = wt.HANDLE
        k.CreateToolhelp32Snapshot.argtypes = [wt.DWORD, wt.DWORD]
        k.CreateToolhelp32Snapshot.restype = wt.HANDLE
        for name in ("Thread32First", "Thread32Next"):
            getattr(k, name).argtypes = [wt.HANDLE, ctypes.POINTER(THREADENTRY32)]
            getattr(k, name).restype = wt.BOOL
        for name in ("GetProcessTimes", "GetThreadTimes"):
            getattr(k, name).argtypes = [wt.HANDLE] + [ctypes.POINTER(FT)] * 4
            getattr(k, name).restype = wt.BOOL
        k.GetThreadDescription.argtypes = [wt.HANDLE, ctypes.POINTER(ctypes.c_wchar_p)]
        k.GetThreadDescription.restype = wt.LONG
        k.LocalFree.argtypes = [wt.HANDLE]
        k.LocalFree.restype = wt.HANDLE
        k.CloseHandle.argtypes = [wt.HANDLE]
        k.CloseHandle.restype = wt.BOOL

    def times(self, handle, thread=False):
        created, exited, kernel, user = FT(), FT(), FT(), FT()
        fn = self.k32.GetThreadTimes if thread else self.k32.GetProcessTimes
        if not fn(handle, ctypes.byref(created), ctypes.byref(exited),
                  ctypes.byref(kernel), ctypes.byref(user)):
            raise ctypes.WinError(ctypes.get_last_error())
        seconds = lambda value: ((value.hi << 32) | value.lo) / 1e7
        # Creation time disambiguates reused thread IDs between snapshots.
        return (created.hi << 32) | created.lo, seconds(kernel) + seconds(user)

    def proc_cpu(self, pid):
        handle = self.k32.OpenProcess(0x1000, False, pid)
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            return self.times(handle)[1]
        finally:
            self.k32.CloseHandle(handle)

    def thread_cpu(self, pid):
        snapshot = self.k32.CreateToolhelp32Snapshot(0x4, 0)
        if snapshot == ctypes.c_void_p(-1).value:
            raise ctypes.WinError(ctypes.get_last_error())
        entry = THREADENTRY32()
        entry.dwSize = ctypes.sizeof(entry)
        result = {}
        try:
            ok = self.k32.Thread32First(snapshot, ctypes.byref(entry))
            while ok:
                if entry.th32OwnerProcessID == pid:
                    handle = self.k32.OpenThread(0x0800, False, entry.th32ThreadID)
                    if handle:
                        try:
                            created, cpu = self.times(handle, thread=True)
                            description = ctypes.c_wchar_p()
                            name = ""
                            if self.k32.GetThreadDescription(handle, ctypes.byref(description)) >= 0:
                                try:
                                    name = description.value or ""
                                finally:
                                    if description:
                                        self.k32.LocalFree(ctypes.cast(description, wt.HANDLE))
                            result[(entry.th32ThreadID, created)] = (name or "unnamed", cpu)
                        except OSError:
                            pass  # A thread can exit while the snapshot is being read.
                        finally:
                            self.k32.CloseHandle(handle)
                ok = self.k32.Thread32Next(snapshot, ctypes.byref(entry))
        finally:
            self.k32.CloseHandle(snapshot)
        return result


def thread_delta(before, after, seconds):
    totals = {}
    for identity, (name, cpu) in after.items():
        delta = max(0, cpu - before.get(identity, (name, 0))[1])
        name = re.sub(r"\d+", "#", name)
        totals[name] = totals.get(name, 0) + delta / seconds
    return dict(sorted(totals.items(), key=lambda row: -row[1]))


def read_cvars(path):
    if path is None:
        return []
    names = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        name = line.split("//", 1)[0].split("#", 1)[0].strip()
        if not name:
            continue
        if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", name):
            raise ValueError(f"invalid cvar name (one name per line): {name!r}")
        if name not in names:
            names.append(name)
    if not names:
        raise ValueError("cvar list is empty")
    return names


def console_text(text):
    """Normalize client channels and timestamped console.log channels alike."""
    return "\n".join(re.sub(r"^(?:\d{1,2}/\d{1,2}\s+[\d:]+\s+)?(?:\[[^\]\r\n]+\]\s*)?", "", line)
                     for line in text.splitlines())


def parse_values(text, names):
    values, evidence = {}, {}
    text = console_text(text)
    for name in names:
        # Only a cvar assignment at the line start is a value; help/flag prose
        # mentioning `name = value` must not become an effective readback.
        match = re.search(r'(?m)^\s*"?' + re.escape(name) + r'"?\s*=\s*("[^"\r\n]*"|[^\s\r\n]+)', text)
        values[name] = match[1].strip('"') if match else None
        evidence[name] = match[0].strip() if match else None
    return dict(values=values, evidence=evidence, missing=[name for name in names if values[name] is None])


def value_segment(text):
    text = console_text(text)
    begin = re.search(r"(?m)^\s*R3_VALUES_BEGIN\s*$", text)
    if begin is None:
        raise ValueError("effective-value dump BEGIN marker missing")
    end = re.search(r"(?m)^\s*R3_VALUES_END\s*$", text[begin.end():])
    if end is None:
        raise ValueError("effective-value dump END marker missing")
    return text[begin.end():begin.end() + end.start()]


def dump_values(tail, names, output=None):
    start = tail.mark()
    raw_path = output / "effective-values-vcon.txt" if output is not None else None
    reply = vcon("exec bench_r3_values", timeout=90, reply_path=raw_path)
    text, source = reply, "vconsole_reply"
    # VConsole command output normally exists ONLY on the issuing connection.
    # Fall back to the launch log only when the reply's END marker is absent.
    if not re.search(r"(?m)^\s*R3_VALUES_END\s*$", console_text(reply)):
        text = wait_log(tail, r"R3_VALUES_END", start, 30)
        source = "console_log_fallback"
    values = parse_values(value_segment(text), names)
    values["source"] = source
    return values, text, reply


def boot_state():
    path = CFG / "boot.vcfg"
    if not path.exists():
        return dict(path=str(path), present=False)
    data = path.read_bytes()
    match = re.search(r'"GlobalThreadPoolMode"\s+"([^"]+)"', data.decode("utf-8", "replace"))
    return dict(path=str(path), sha256=hashlib.sha256(data).hexdigest(),
                global_thread_pool_mode=match[1] if match else None)


def launch(tail, output, extra_cfg=None, extra_args=""):
    command = launch_command(extra_cfg, extra_args)
    result = subprocess.run(command, capture_output=True, text=True, timeout=60)
    (output / "launcher.txt").write_text(result.stdout + result.stderr, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"dead.bat returned {result.returncode}: {result.stdout}\n{result.stderr}")
    ready = subprocess.run(["py", VCON, "--wait-ready", "180"],
                           capture_output=True, text=True, timeout=200)
    if ready.returncode:
        raise RuntimeError(f"VConsole did not become ready: {ready.stdout}\n{ready.stderr}")
    wait_log(tail, r"SIGNONSTATE_FULL", timeout=180)
    time.sleep(5)
    # The proxy's command may not have registered when startup cfg first ran.
    (output / "unhide.txt").write_text(vcon("cvar_unhide", timeout=60), encoding="utf-8")
    if extra_cfg is not None:
        reply = vcon(f"exec {extra_cfg.name}", timeout=60)
        (output / "extra-cfg-exec.txt").write_text(reply, encoding="utf-8")


def demo_ready(tail):
    start = tail.mark()
    vcon(f"playdemo {DEMO}", timeout=60)
    wait_log(tail, r"\[Demo\] playing demo from", start, 120)
    # Only Host activate means the demo's class tables are loaded. "SIGNONSTATE_FULL -> NONE" appears
    # right after playdemo and once let demo_gototick race activation (FATAL CopyNewEntity class index).
    wait_log(tail, r"Host activate: Playing Demo", start, 180)
    time.sleep(8)
    vcon("demo_pause", timeout=60)
    time.sleep(4)
    start = tail.mark()
    vcon(f"demo_gototick {TICK}", timeout=60)
    wait_log(tail, rf"Demo Skipping: skipping to demo tick {TICK}\b", start, 90)
    time.sleep(6)


def window(tail, sampler, pid, seconds, output):
    baseline, baseline_text, _ = report(tail)
    (output / "report-start.log").write_text(baseline_text, encoding="utf-8")
    threads0 = sampler.thread_cpu(pid)
    cpu0 = sampler.proc_cpu(pid)
    t0 = time.monotonic()
    resume_reply = vcon("demo_resume", timeout=60)
    deadline = t0 + seconds
    while time.monotonic() < deadline:
        time.sleep(min(0.25, max(0, deadline - time.monotonic())))
    cpu1 = sampler.proc_cpu(pid)
    t1 = time.monotonic()
    threads1 = sampler.thread_cpu(pid)
    # Pause before requesting the end report so the target demo segment stops.
    pause_reply = vcon("demo_pause", timeout=60)
    end, end_text, _ = report(tail)
    (output / "report-end.log").write_text(end_text, encoding="utf-8")
    elapsed = t1 - t0
    present = end["present_n"] - baseline["present_n"]
    if present <= 0 or end["frames"] <= baseline["frames"]:
        raise ValueError("VProfLite counters did not increase or reset during the window")
    segment = tail.segment()
    premature_end = "Demo playback finished" in segment
    threads = thread_delta(threads0, threads1, elapsed)
    frame = end["rows"]["FrameTotal"]
    render = end["rows"]["Client Rendering"]
    frame_delta = end["frames"] - baseline["frames"]
    ratio = frame_delta / present
    warnings = ["VProfLite percentiles cover the whole demo activation, not only the timed window",
                "Present delta includes small command/report boundary delays and paused render frames",
                "Exited threads are omitted from per-thread deltas; process CPU includes them"]
    if 1.7 <= ratio <= 2.3:
        warnings.append("VProfLite frame count is about 2x Present count; all-frame FPS/P1/Avg/P99 are biased")
    if frame["n"] > 1.2 * end["present_n"]:
        warnings.append("FrameTotal active samples also outnumber Presents; active frame percentiles may be biased")
    if premature_end:
        warnings.append("Demo ended before end report; this run is invalid")
    return dict(valid=not premature_end, wall_seconds=elapsed, requested_seconds=seconds,
                present_n=present, frame_n=frame_delta, frame_to_present_ratio=ratio,
                doubled_frame_count=1.7 <= ratio <= 2.3,
                fps=present / elapsed, cpu_seconds=cpu1 - cpu0,
                cpu_cores=(cpu1 - cpu0) / elapsed, threads_cores=threads,
                globpool_workers=sum(name.startswith("GlobPool") for name, _ in threads0.values()),
                globpool_cores=sum(value for name, value in threads.items() if name.startswith("GlobPool")),
                main_cores=sum(value for name, value in threads.items() if "MainThrd" in name),
                render_cores=sum(value for name, value in threads.items() if "RenderThread" in name),
                frame_active_avg_ms=frame["aavg"], frame_active_p99_ms=frame["ap99"],
                frame_active_p99_fps_proxy=1000 / frame["ap99"] if frame["ap99"] else None,
                client_render_active_p99_ms=render["ap99"],
                percentile_scope="cumulative_since_demo_level_activation",
                reported_fps_p1=end["reported_fps_p1"], report_start=baseline, report_end=end,
                command_output=dict(resume=resume_reply, pause=pause_reply), warnings=warnings)


def paired_summary(runs):
    # Each adjacent AB/BA pair is one independent contrast; never cross-pair a
    # failed run or pretend the four ABBA runs are four independent differences.
    pairs = [(runs[i], runs[i + 1]) for i in range(0, len(runs) - 1, 2)
             if runs[i].get("valid") and runs[i + 1].get("valid")]
    critical = [None, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306,
                2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110,
                2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056,
                2.052, 2.048, 2.045, 2.042]
    result = {}
    for metric in METRICS:
        samples = {label: [run[metric] for run in runs if run.get("valid") and run["label"] == label
                           and run.get(metric) is not None] for label in "AB"}
        differences = []
        for pair in pairs:
            by_label = {run["label"]: run for run in pair}
            if all(by_label[label].get(metric) is not None for label in "AB"):
                differences.append(by_label["B"][metric] - by_label["A"][metric])
        mean = statistics.mean(differences) if differences else None
        ci = None
        if len(differences) >= 2:
            df = len(differences) - 1
            z = 1.959964
            t = critical[df] if df < len(critical) else z + (z ** 3 + z) / (4 * df)
            half = t * statistics.stdev(differences) / math.sqrt(len(differences))
            ci = [mean - half, mean + half]
        result[metric] = dict(mean_A=statistics.mean(samples["A"]) if samples["A"] else None,
                              mean_B=statistics.mean(samples["B"]) if samples["B"] else None,
                              pairs=len(differences), paired_B_minus_A=mean, ci95=ci,
                              differences=differences)
    return result


def markdown(document):
    fmt = lambda value: "—" if value is None else f"{value:.3f}"
    lines = ["# R3 restarted A/B benchmark", "", f"Order: `{document['order']}`. Difference: B − A.", "",
             "Percentiles are cumulative since demo level activation, not isolated-window estimates.",
             "FPS uses window Present count differences. Higher FPS is better; lower P99 is better.", "",
             "| Run | Valid | FPS | CPU cores | GlobPool | Main | Render | Active Avg ms* | Active P99 ms* |",
             "|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    for run in document["runs"]:
        values = [fmt(run.get(key)) for key in ("fps", "cpu_cores", "globpool_cores", "main_cores",
                                                "render_cores", "frame_active_avg_ms", "frame_active_p99_ms")]
        lines.append(f"| {run['id']} {run['label']} | {run.get('valid', False)} | " + " | ".join(values) + " |")
    lines.extend(["", "| Metric | Mean A | Mean B | Paired B − A | 95% CI | Pairs |",
                  "|---|---:|---:|---:|---|---:|"])
    for metric, row in document["summary"].items():
        ci = "not estimable" if row["ci95"] is None else "[" + ", ".join(fmt(v) for v in row["ci95"]) + "]"
        lines.append(f"| {metric} | {fmt(row['mean_A'])} | {fmt(row['mean_B'])} | "
                     f"{fmt(row['paired_B_minus_A'])} | {ci} | {row['pairs']} |")
    lines.extend(["", "95% CIs use paired Student-t contrasts (adjacent AB/BA pairs). ABBA has only two pairs;",
                  "its CI is necessarily wide and is not proof of a repeatable gain.", "", "## Warnings", ""])
    warnings = sorted({warning for run in document["runs"] for warning in run.get("warnings", [])})
    lines.extend(f"- {warning}" for warning in warnings)
    for run in document["runs"]:
        if run.get("error"):
            lines.append(f"- Run {run['id']}: {run['error']}")
    if document.get("error"):
        lines.append(f"- Run set: {document['error']}")
    return "\n".join(lines) + "\n"


def print_plan(args):
    variants = {"dump": args.gi} if args.mode == "dump" else {"A": args.a, "B": args.b}
    order = ["dump"] if args.mode == "dump" else list(args.order)
    extras = arm_cfgs(args)
    arguments = arm_args(args)
    print("READ-ONLY PLAN: no writes, processes or gameinfo validation; optional cfg bytes are read only for SHA256.")
    print(f"Backup once: {GI} -> {GI}.pre-r3-<timestamp>.bak")
    print(f"Temporarily install cfgs: {CFG / 'bench_r3.cfg'}, {CFG / 'bench_r3_values.cfg'}; restore both at end.")
    print("bench_r3.cfg:\n" + START_CFG)
    query = f"// Each validated name from {args.cvars}, queried without a value\n" if args.cvars else ""
    print("bench_r3_values.cfg:\n" + VALUE_CFG.format(queries=query))
    for index, label in enumerate(order, 1):
        print(f"Run {index} {label}: kill/wait deadlock.exe; copy {variants[label]} -> {GI}")
        extra = extras[label]
        if extra is not None:
            target = cfg_target(extra)
            digest = hashlib.sha256(extra.read_bytes()).hexdigest() if extra.is_file() else "unavailable (file not present)"
            print(f"Extra cfg: backup target once; copy {extra} -> {target}; sha256={digest}; restore/remove at end")
        print(f"Extra launch arguments: {arguments[label] or '(none)'}")
        print(launch_command(extra, arguments[label]))
        print(f"py {VCON} --wait-ready 180; wait launch-only SIGNONSTATE_FULL; cvar_unhide")
        if extra is not None:
            print(f"After cvar_unhide: vcon exec {extra.name}")
        if args.mode == "dump":
            print("exec bench_r3_values -> effective-values.json (missing names remain null)")
        else:
            print(f"playdemo {DEMO}; wait demo activation; demo_pause; demo_gototick {TICK}; settle 6s")
            print(f"start report/CPU; demo_resume; measure {args.secs:g}s; demo_pause; end report/CPU")
    print("Finally: kill/wait deadlock.exe; restore original gameinfo and all touched cfg targets.")
    print(f"Outputs under {BENCH}/runs-<timestamp>/: inputs, cfgs, console slices, JSON, markdown.")
    print("Launcher itself writes user-local video.txt, launcher.cfg, autoexec hook, and self-copy; see README.")
    print("Pinned before every launch and restored at the end: machine_convars.vcfg, user_convars_0_slot0.vcfg, boot.vcfg.")
    print("No auto.cfg or video file is written by harness3; supplied extra cfgs may set performance cvars.")


def write_json(path, document):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(document, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def run_set(args):
    if os.name != "nt":
        raise RuntimeError("actual execution requires Windows; --plan works without Windows APIs")
    names = read_cvars(args.cvars)
    variants = {"dump": args.gi} if args.mode == "dump" else {"A": args.a, "B": args.b}
    # Freeze all inputs before modifying the installed file (even if it is an input).
    contents = {label: path.read_bytes() for label, path in variants.items()}
    extras = arm_cfgs(args)
    arguments = arm_args(args)
    extra_targets = {label: cfg_target(path) for label, path in extras.items() if path is not None}
    extra_contents = {label: extras[label].read_bytes() for label in extra_targets}
    if not all(contents.values()):
        raise ValueError("gameinfo inputs must not be empty")
    if not GI.is_file() or not Path(VCON).is_file():
        raise FileNotFoundError("installed gameinfo.gi and desktop vcon.py are required")
    if not Path("C:/Users/Administrator/Desktop/dead.bat").is_file():
        raise FileNotFoundError("desktop dead.bat is required")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    output = BENCH / f"runs-{stamp}"
    output.mkdir(parents=True)
    generated = {CFG / "bench_r3.cfg": START_CFG,
                 CFG / "bench_r3_values.cfg": VALUE_CFG.format(queries="".join(name + "\n" for name in names))}
    # The game saves archived ConVars on graceful exit; pin these files so one
    # run's archived values cannot leak into the next launch.
    pinned = [CFG / "machine_convars.vcfg", CFG / "user_convars_0_slot0.vcfg", CFG / "boot.vcfg"]
    touched = set(generated) | set(extra_targets.values()) | set(pinned)
    previous = {path: path.read_bytes() if path.exists() else None for path in touched}
    backup = GI.with_name(f"gameinfo.gi.pre-r3-{stamp}.bak")
    shutil.copyfile(GI, backup)
    document = dict(mode=args.mode, order=args.order if args.mode == "ab" else "dump",
                    launch=LAUNCH, original_backup=str(backup), cvars=names,
                    started=datetime.now().isoformat(), runs=[], restored=False,
                    original_sha256=hashlib.sha256(backup.read_bytes()).hexdigest())
    order = ["dump"] if args.mode == "dump" else list(args.order)
    try:
        for label, data in contents.items():
            (output / f"input-{label}.gi").write_bytes(data)
        for label, data in extra_contents.items():
            (output / f"input-{label}-{extra_targets[label].name}").write_bytes(data)
        for path, content in generated.items():
            (output / path.name).write_text(content, encoding="utf-8")
        for path, data in previous.items():
            if data is not None:
                (output / ("original-" + path.name)).write_bytes(data)
        sampler = CpuSampler() if args.mode == "ab" else None
        for index, label in enumerate(order, 1):
            kill_game()
            GI.write_bytes(contents[label])
            for path, content in generated.items():
                path.write_text(content, encoding="utf-8")
            for path in pinned:
                if previous[path] is not None:
                    path.write_bytes(previous[path])
            # Do not leave the prior arm's cfg active through an existing autoexec
            # reference when the next arm omits it or uses another basename.
            for target in set(extra_targets.values()):
                original = previous[target]
                if original is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_bytes(original)
            extra = extra_targets.get(label)
            if extra is not None:
                extra.write_bytes(extra_contents[label])
            run_output = output / f"{index:02d}-{label}"
            run_output.mkdir()
            tail = LogTail()
            rec = dict(id=index, label=label, input=str(variants[label]),
                       gi_sha256=hashlib.sha256(contents[label]).hexdigest(),
                       console_log=str(run_output / "console.log"), boot_before=boot_state(), valid=False)
            rec["extra_launch_args"] = arguments[label]
            rec["launch"] = launch_command(extra, arguments[label])
            rec["cfg"] = (dict(input=str(extras[label]), installed=str(extra),
                               sha256=hashlib.sha256(extra_contents[label]).hexdigest())
                          if extra is not None else None)
            document["runs"].append(rec)
            try:
                launch(tail, run_output, extra, arguments[label])
                pids = game_pids()
                if len(pids) != 1:
                    raise RuntimeError(f"expected one deadlock.exe, found {pids}")
                rec["pid"] = pids[0]
                if args.mode == "ab":
                    demo_ready(tail)
                if names:
                    values, text, reply = dump_values(tail, names, run_output)
                    rec["effective_values"] = values
                    (run_output / "effective-values.log").write_text(text, encoding="utf-8")
                    write_json(run_output / "effective-values.json", values)
                if args.mode == "dump":
                    rec["valid"] = not rec["effective_values"]["missing"]
                    write_json(output / "effective-values.json", rec)
                else:
                    rec.update(window(tail, sampler, pids[0], args.secs, run_output))
                    if names and rec["effective_values"]["missing"]:
                        rec["valid"] = False
                        rec["warnings"].append("Requested effective values missing: " +
                                               ", ".join(rec["effective_values"]["missing"]))
            except BaseException as error:
                rec["error"] = f"{type(error).__name__}: {error}"
                raise
            finally:
                try:
                    kill_game()
                finally:
                    tail.save(run_output / "console.log")
                    rec["log_resets"] = tail.resets
                    rec["boot_after"] = boot_state()
                    write_json(output / "results.json", document)
            print(f"Run {index} {label}: valid={rec['valid']} FPS={rec.get('fps')} CPU cores={rec.get('cpu_cores')}", flush=True)
    except BaseException as error:
        document["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        # Restore each resource independently, even when shutdown or another
        # restore fails. Retain the on-disk backup for recovery after power loss.
        restore_errors = []
        try:
            kill_game()
        except BaseException as error:
            restore_errors.append(f"shutdown: {error}")
        try:
            shutil.copyfile(backup, GI)
            document["restored"] = hashlib.sha256(GI.read_bytes()).hexdigest() == document["original_sha256"]
            if not document["restored"]:
                restore_errors.append("gameinfo restore hash differs from original backup")
        except BaseException as error:
            restore_errors.append(f"gameinfo restore: {error}")
        for path, data in previous.items():
            try:
                if data is None:
                    path.unlink(missing_ok=True)
                else:
                    path.write_bytes(data)
            except BaseException as error:
                restore_errors.append(f"cfg restore {path}: {error}")
        document["restore_errors"] = restore_errors
        document["finished"] = datetime.now().isoformat()
        if args.mode == "ab":
            document["summary"] = paired_summary(document["runs"])
            (output / "summary.md").write_text(markdown(document), encoding="utf-8")
        write_json(output / "results.json", document)
        print(f"Outputs: {output}", flush=True)
        if restore_errors:
            raise RuntimeError("; ".join(restore_errors))
    return 0 if all(run["valid"] for run in document["runs"]) else 1


def self_check():
    """Offline regression check; no Windows API or game/file side effects."""
    sample = """-- Performance report --
Summary of 2000 frames and 10 1-second intervals.
FPS: Avg=200.0, P1=100.0
[VProf] FrameTotal 5.00 10.00 2000 5.00 10.00 8.00 12.00 10 8.00 12.00
[VProf] Client Rendering 3.00 6.00 1000 6.00 12.00 7.00 13.00 10 7.00 13.00
[VProf] Present_RenderDevice 0.10 0.20 1000 0.20 0.40 0.20 0.50 10 0.20 0.50
"""
    parsed = parse_seg(sample)
    assert parsed["doubled_frame_count"] and parsed["present_n"] == 1000
    assert parsed["rows"]["Client Rendering"]["ap99"] == 12
    values = parse_values('[Console] "fps_max" = "240"\nother = false\n', ["fps_max", "absent"])
    assert values["values"] == {"fps_max": "240", "absent": None}
    assert values["missing"] == ["absent"]
    reply_sample = """[InputService] execing bench_r3_values.cfg
[Console] R3_VALUES_BEGIN
[Console] fps_max = 240 ( def. 0 )
[Console]     Flags: archive
[Console] Help example: fps_max = 999
[Console] "r_lightmap_size" = "1"
[Console] Help example: absent = 123
[Console] R3_VALUES_END
[Console] fps_max = 999
"""
    reply_values = parse_values(value_segment(reply_sample), ["fps_max", "r_lightmap_size", "absent"])
    assert reply_values["values"] == {"fps_max": "240", "r_lightmap_size": "1", "absent": None}
    assert reply_values["missing"] == ["absent"]
    timestamped = "\n".join("10/11 10:14:51 " + line for line in reply_sample.splitlines())
    assert parse_values(value_segment(timestamped), ["fps_max"])["values"]["fps_max"] == "240"
    runs = [dict(id=i, label=label, valid=True, fps=fps) for i, (label, fps) in
            enumerate((("A", 100), ("B", 110), ("B", 108), ("A", 101)), 1)]
    summary = paired_summary(runs)["fps"]
    assert summary["differences"] == [10, 7] and summary["paired_B_minus_A"] == 8.5
    assert summary["ci95"][0] < 0 < summary["ci95"][1]
    parser = build_parser()
    ab_args = parser.parse_args(["--plan", "ab", "--a", "a.gi", "--b", "b.gi",
                                "--a-cfg", "baseline.cfg", "--b-cfg", "candidate.cfg",
                                "--a-args", "-threads 7", "--b-args", "-threads 15"])
    assert arm_cfgs(ab_args) == {"A": Path("baseline.cfg"), "B": Path("candidate.cfg")}
    assert arm_args(ab_args) == {"A": "-threads 7", "B": "-threads 15"}
    dump_args = parser.parse_args(["dump", "--gi", "baseline.gi", "--cvars", "list.txt",
                                  "--cfg", "perf_r3.cfg", "--args", "-threads 7"])
    assert arm_cfgs(dump_args) == {"dump": Path("perf_r3.cfg")}
    target = cfg_target(dump_args.cfg)
    assert target.name == "perf_r3.cfg"
    assert launch_command(target).endswith('+exec bench_r3 +exec perf_r3"')
    assert launch_command() == LAUNCH
    assert arm_args(dump_args) == {"dump": "-threads 7"}
    assert launch_command(target, dump_args.args).endswith('+exec bench_r3 +exec perf_r3 -threads 7"')
    assert safe_launch_args("  -threads   7  ") == "-threads 7"
    for unsafe in ('-threads "7"', "-threads '7'", "-threads 7 & echo bad",
                   "-threads 7 | echo bad", "<input", ">output", "%PATH%", "!PATH!", "^x"):
        try:
            safe_launch_args(unsafe)
        except argparse.ArgumentTypeError:
            pass
        else:
            raise AssertionError(f"accepted unsafe launch arguments: {unsafe}")
    assert all(valid_order(order) for order in ("AB", "BA", "ABAB", "ABBA", "ABBAABBA"))
    assert not any(valid_order(order) for order in ("", "A", "AA", "AABB", "ABX", "ABBAA"))
    print("Offline parser/value/pairing/cfg/launch-argument checks passed")


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", action="store_true", help="print only; no files or processes changed")
    parser.add_argument("--self-check", action="store_true", help="offline parser/value/pairing assertions")
    modes = parser.add_subparsers(dest="mode")
    dump = modes.add_parser("dump", help="one restarted effective-value capture")
    dump.add_argument("--gi", type=Path, required=True)
    dump.add_argument("--cvars", type=Path, required=True)
    dump.add_argument("--cfg", type=Path, help="extra cfg copied and exec'd after startup/unhide")
    dump.add_argument("--args", type=safe_launch_args, default="", help="extra literal launch arguments")
    ab = modes.add_parser("ab", help="restarted adjacent AB/BA pairs")
    ab.add_argument("--a", type=Path, required=True)
    ab.add_argument("--b", type=Path, required=True)
    ab.add_argument("--a-cfg", type=Path, help="extra cfg for arm A")
    ab.add_argument("--b-cfg", type=Path, help="extra cfg for arm B")
    ab.add_argument("--a-args", type=safe_launch_args, default="", help="extra literal launch arguments for arm A")
    ab.add_argument("--b-args", type=safe_launch_args, default="", help="extra literal launch arguments for arm B")
    ab.add_argument("--order", default="ABBA", type=str.upper)
    ab.add_argument("--secs", default=300.0, type=float)
    ab.add_argument("--cvars", type=Path, help="optional effective-value capture after seeking each run")
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.self_check:
        if args.plan or args.mode:
            parser.error("--self-check is standalone")
        self_check()
        return 0
    if args.mode is None:
        parser.error("dump or ab is required")
    if args.mode == "ab":
        if not math.isfinite(args.secs) or not 0 < args.secs <= 470:
            parser.error("--secs must be >0 and <=470 (known demo has about 496s after target tick)")
        if not valid_order(args.order):
            parser.error("--order must contain adjacent AB/BA pairs, e.g. ABAB, ABBA or ABBAABBA")
    if args.plan:
        print_plan(args)
        return 0
    return run_set(args)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("Interrupted; inspect results.json for restoration status", file=sys.stderr)
        sys.exit(130)
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
