// Local development only: not used in CI or production.
//
// On exFAT drives, Node's readlink() fails with EISDIR for ordinary files and folders, where every
// other filesystem returns EINVAL ("not a symlink"). Next.js, webpack and Turbopack treat EINVAL as
// "not a link" but crash on EISDIR. This preload maps one to the other.
//
// Use it by preloading it for the session, e.g. in PowerShell:
//   $env:NODE_OPTIONS = "--require ./scripts/exfat-readlink-shim.cjs"
const fs = require("node:fs");

const toEinval = (error) => {
  if (error && error.code === "EISDIR" && error.syscall === "readlink") {
    error.code = "EINVAL";
    error.errno = -4071;
  }
  return error;
};

const readlinkSync = fs.readlinkSync;
fs.readlinkSync = function patchedReadlinkSync(...args) {
  try {
    return readlinkSync.apply(this, args);
  } catch (error) {
    throw toEinval(error);
  }
};

const readlink = fs.readlink;
fs.readlink = function patchedReadlink(path, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "function" ? undefined : options;
  return readlink.call(this, path, opts, (error, link) => cb(toEinval(error), link));
};

const promisesReadlink = fs.promises.readlink;
fs.promises.readlink = async function patchedPromisesReadlink(...args) {
  try {
    return await promisesReadlink.apply(this, args);
  } catch (error) {
    throw toEinval(error);
  }
};
