let deadModExportsPromise = null;

async function loadDeadModExports() {
  if (!deadModExportsPromise) {
    deadModExportsPromise = (async () => {
      const { dotnet } = await import("../vendor/deadmod/_framework/dotnet.js");
      const { getAssemblyExports, getConfig, runMain } = await dotnet.create();
      const config = getConfig();
      const exports = await getAssemblyExports(config.mainAssemblyName);
      await runMain();
      return exports;
    })();
  }
  return deadModExportsPromise;
}

function flattenFiles(files) {
  const filePaths = files.map((file) => file.path);
  const fileSizes = files.map((file) => file.bytes.byteLength);
  const totalSize = fileSizes.reduce((sum, size) => sum + size, 0);
  const fileContents = new Uint8Array(totalSize);
  let offset = 0;
  for (const file of files) {
    fileContents.set(file.bytes, offset);
    offset += file.bytes.byteLength;
  }
  return { filePaths, fileSizes, fileContents };
}

export async function writeVpkWithDeadMod(files) {
  const exports = await loadDeadModExports();
  if (!exports || !exports.SourceTwoUtils || typeof exports.SourceTwoUtils.MakeVPK !== "function") {
    throw new Error("DeadMod MakeVPK export is unavailable");
  }

  const { filePaths, fileSizes, fileContents } = flattenFiles(files);
  return exports.SourceTwoUtils.MakeVPK(filePaths, fileSizes, fileContents, []);
}
