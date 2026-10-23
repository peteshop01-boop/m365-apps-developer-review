'use strict';
// Only used by the local component preview; native SPFx uses its own official rig.
module.exports = function () {};
module.exports.pitch = function (remaining) {
  return `const loaded = require(${JSON.stringify('!!' + remaining)}); const sheet = loaded.default || loaded;
const style = document.createElement('style'); style.textContent = sheet.toString(); document.head.appendChild(style);
module.exports = sheet.locals || {};`;
};
