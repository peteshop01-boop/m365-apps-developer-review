'use strict';

const crypto = require('node:crypto');
const path = require('node:path');

module.exports = (webpackConfiguration, _taskSession, heftConfiguration) => {
  const projectRoot = heftConfiguration.buildFolderPath;
  const cssHashCache = new Map();
  const generateCssClassName = (existingClassName, cssFilename, cssContent) => {
    const relativeCssFilename = path.relative(projectRoot, cssFilename).replace(/\\/g, '/');
    const cacheKey = `${relativeCssFilename}\0${cssContent}`;
    let hash = cssHashCache.get(cacheKey);
    if (!hash) {
      hash = crypto.createHmac('sha1', relativeCssFilename).update(cssContent).digest('hex').substring(0, 8);
      cssHashCache.set(cacheKey, hash);
    }
    return `${existingClassName}_${hash}`;
  };

  let patchedLoaderCount = 0;
  const visit = value => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const loaderPath = typeof value.loader === 'string' ? value.loader.replace(/\\/g, '/') : '';
    if ((loaderPath.endsWith('/@microsoft/sp-css-loader') || loaderPath.includes('/@microsoft/sp-css-loader/')) &&
        typeof value.options?.generateCssClassName === 'function') {
      value.options.generateCssClassName = generateCssClassName;
      patchedLoaderCount++;
    }
    visit(value.oneOf);
    visit(value.rules);
    visit(value.use);
  };

  visit(webpackConfiguration.module?.rules);
  if (patchedLoaderCount !== 1) {
    throw new Error(`Expected one SPFx CSS-module loader; patched ${patchedLoaderCount}.`);
  }
  webpackConfiguration.optimization.realContentHash = true;
};
