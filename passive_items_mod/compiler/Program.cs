using System.Diagnostics;
using System.Text.Json;
using Microsoft.Win32;

class Program
{
    const string ContentFolder = "dota_addons";
    const int BatchSize = 50;
    static readonly HashSet<string> CompilableExtensions =
    [
        ".xml", ".css", ".js", ".png", ".jpg", ".jpeg", ".tga", ".vmat", ".vtex"
    ];

    sealed class CompilerPreferences
    {
        public string? Directory { get; init; }
        public string? VpkEditCli { get; init; }
    }

    static int Main(string[] args)
    {
        if (args.Length < 1)
            return Fail("Usage: Compiler <mod_folder>");

        string modFolder = args[0];
        if (!Directory.Exists(modFolder))
            return Fail($"Error: Mod folder not found: {modFolder}");

        string modName = Path.GetFileName(modFolder);
        string? rootDir = Path.GetDirectoryName(modFolder);
        if (string.IsNullOrWhiteSpace(rootDir))
            return Fail("Error: Could not resolve mod parent folder");

        var pref = LoadPreferences();
        string? gameDir = FindGameDirectory(pref.Directory);
        if (gameDir == null)
            return Fail("Error: Could not find Dota 2 directory");

        Console.WriteLine($"Mod: {modName}");
        Console.WriteLine($"Path: {modFolder}");
        Console.WriteLine($"Game: {gameDir}");

        string stagingDir = Path.Combine(gameDir, "content", ContentFolder, modName);
        string gameOutputDir = Path.Combine(gameDir, "game", ContentFolder, modName);
        string compiledDir = Path.Combine(rootDir, $"{modName}_compiled");
        string vpkPath = Path.Combine(rootDir, "pak99_dir.vpk");
        string rcPath = Path.Combine(gameDir, "game", "bin", "win64", "resourcecompiler.exe");

        if (!File.Exists(rcPath))
            return Fail($"Error: resourcecompiler.exe not found at {rcPath}");

        string sourcePanoramaDir = Path.Combine(modFolder, "panorama");
        if (!Directory.Exists(sourcePanoramaDir))
            return Fail($"Error: panorama folder not found: {sourcePanoramaDir}");

        ResetDirectory(gameOutputDir);
        string stagingPanoramaDir = Path.Combine(stagingDir, "panorama");
        ResetDirectory(stagingDir);
        CopyDirectory(sourcePanoramaDir, stagingPanoramaDir);

        var files = Directory
            .GetFiles(stagingPanoramaDir, "*", SearchOption.AllDirectories)
            .Where(f => CompilableExtensions.Contains(Path.GetExtension(f).ToLowerInvariant()))
            .ToList();

        Console.WriteLine($"Files: {files.Count}");
        if (files.Count == 0)
            return Fail("No files to compile");

        if (!CompileBatches(rcPath, files))
            return 1;

        string gameOutputPanoramaDir = Path.Combine(gameOutputDir, "panorama");
        if (!Directory.Exists(gameOutputPanoramaDir))
            return Fail("Error: No compiled panorama output found in game directory");

        ResetDirectory(compiledDir);
        CopyDirectory(gameOutputPanoramaDir, Path.Combine(compiledDir, "panorama"));
        Console.WriteLine($"Created {modName}_compiled folder");

        string? vpkCli = ResolveVpkEditCliPath(pref.VpkEditCli);
        if (vpkCli == null)
            return Fail("Error: vpkeditcli.exe not found");

        if (File.Exists(vpkPath))
            File.Delete(vpkPath);

        if (!CreateVpk(vpkCli, compiledDir, vpkPath))
            return Fail("Error: VPK packaging failed");

        Console.WriteLine($"Created VPK: {vpkPath}");
        Console.WriteLine("Done!");
        return 0;
    }

    static CompilerPreferences LoadPreferences()
    {
        string prefPath = Path.Combine(AppContext.BaseDirectory, "pref.json");
        if (!File.Exists(prefPath))
            return new CompilerPreferences();

        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(prefPath));
            return new CompilerPreferences
            {
                Directory = doc.RootElement.TryGetProperty("directory", out var dirProp) ? dirProp.GetString() : null,
                VpkEditCli = doc.RootElement.TryGetProperty("vpkeditcli", out var cliProp) ? cliProp.GetString() : null
            };
        }
        catch
        {
            return new CompilerPreferences();
        }
    }

    static string? FindGameDirectory(string? preferredDirectory)
    {
        if (!string.IsNullOrWhiteSpace(preferredDirectory) && Directory.Exists(preferredDirectory))
            return preferredDirectory;

        var steamRoots = new[]
        {
            "C:\\Program Files (x86)\\Steam",
            "E:\\SteamLibrary",
            "D:\\SteamLibrary"
        };

        if (OperatingSystem.IsWindows())
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\WOW6432Node\Valve\Steam");
            var regPath = key?.GetValue("InstallPath") as string;
            if (!string.IsNullOrWhiteSpace(regPath))
                steamRoots = steamRoots.Prepend(regPath).ToArray();
        }

        return steamRoots
            .Select(root => Path.Combine(root, "steamapps", "common", "dota 2 beta"))
            .FirstOrDefault(Directory.Exists);
    }

    static bool CompileBatches(string rcPath, List<string> files)
    {
        int batchCount = (files.Count + BatchSize - 1) / BatchSize;
        for (int i = 0; i < files.Count; i += BatchSize)
        {
            int currentBatch = (i / BatchSize) + 1;
            var batch = files.Skip(i).Take(BatchSize).ToArray();
            Console.WriteLine($"Compiling batch {currentBatch}/{batchCount} ({batch.Length} files)...");

            var psi = new ProcessStartInfo
            {
                FileName = rcPath,
                Arguments = string.Join(" ", batch.Select(f => $"\"{f}\"")),
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var proc = Process.Start(psi);
            if (proc == null)
                return false;

            string stdout = proc.StandardOutput.ReadToEnd();
            string stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit();

            if (!string.IsNullOrWhiteSpace(stdout))
                Console.WriteLine(stdout.TrimEnd());

            if (proc.ExitCode == 0)
                continue;

            if (!string.IsNullOrWhiteSpace(stderr))
                Console.WriteLine(stderr.TrimEnd());

            Console.WriteLine($"Error: resourcecompiler failed on batch {currentBatch}");
            return false;
        }

        Console.WriteLine("Compilation complete!");
        return true;
    }

    static string? ResolveVpkEditCliPath(string? configuredPath)
    {
        if (!string.IsNullOrWhiteSpace(configuredPath))
        {
            string candidate = Environment.ExpandEnvironmentVariables(configuredPath.Trim());
            if (!Path.IsPathRooted(candidate))
                candidate = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, candidate));

            if (File.Exists(candidate))
                return candidate;

            Console.WriteLine($"Warning: Configured vpkeditcli path not found: {candidate}");
        }

        string localPath = Path.Combine(AppContext.BaseDirectory, "vpkeditcli.exe");
        return File.Exists(localPath) ? localPath : null;
    }

    static bool CreateVpk(string vpkEditCliPath, string compiledDir, string vpkPath)
    {
        Console.WriteLine($"Packing VPK: {vpkPath}");
        var psi = new ProcessStartInfo
        {
            FileName = vpkEditCliPath,
            Arguments = $"\"{compiledDir}\" -o \"{vpkPath}\" -s",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var proc = Process.Start(psi);
        if (proc == null)
            return false;

        string stdout = proc.StandardOutput.ReadToEnd();
        string stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit();

        if (!string.IsNullOrWhiteSpace(stdout))
            Console.WriteLine(stdout.TrimEnd());
        if (!string.IsNullOrWhiteSpace(stderr))
            Console.WriteLine(stderr.TrimEnd());

        return proc.ExitCode == 0;
    }

    static void ResetDirectory(string path)
    {
        if (Directory.Exists(path))
            Directory.Delete(path, true);
        Directory.CreateDirectory(path);
    }

    static void CopyDirectory(string source, string dest)
    {
        Directory.CreateDirectory(dest);
        foreach (string file in Directory.GetFiles(source))
            File.Copy(file, Path.Combine(dest, Path.GetFileName(file)), true);
        foreach (string dir in Directory.GetDirectories(source))
            CopyDirectory(dir, Path.Combine(dest, Path.GetFileName(dir)));
    }

    static int Fail(string message)
    {
        Console.WriteLine(message);
        return 1;
    }
}
