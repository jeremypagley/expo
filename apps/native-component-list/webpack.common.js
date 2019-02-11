const path = require('path');
const webpack = require('webpack');
const InterpolateHtmlPlugin = require('react-dev-utils/InterpolateHtmlPlugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ManifestPlugin = require('webpack-manifest-plugin');
const WorkboxPlugin = require('workbox-webpack-plugin');
const locations = require('./webpackLocations');

const nativeAppManifest = require(locations.absolute('./app.json'));

const { productionPath = 'web-build' } = nativeAppManifest.expo.web;

function getAppManifest() {
  if (nativeAppManifest && nativeAppManifest.expo) {
    const { expo } = nativeAppManifest;
    const PWAManifest = require(locations.absolute('./web/manifest.json'));
    const web = PWAManifest || {};

    return {
      // facebookScheme
      // facebookAppId
      // facebookDisplayName
      name: expo.name,
      description: expo.description,
      slug: expo.slug,
      sdkVersion: expo.sdkVersion,
      version: expo.version,
      githubUrl: expo.githubUrl,
      orientation: expo.orientation,
      primaryColor: expo.primaryColor,
      privacy: expo.privacy,
      icon: expo.icon,
      scheme: expo.scheme,
      notification: expo.notification,
      splash: expo.splash,
      androidShowExponentNotificationInShellApp: expo.androidShowExponentNotificationInShellApp,
      web,
    };
  }
  return {};
}
const environment = process.env.NODE_ENV || 'development';
const __DEV__ = environment !== 'production';

const REACT_APP = /^REACT_APP_/i;

const publicUrl = '';

function getClientEnvironment(publicUrl) {
  let processEnv = Object.keys(process.env)
    .filter(key => REACT_APP.test(key))
    .reduce(
      (env, key) => {
        env[key] = JSON.stringify(process.env[key]);
        return env;
      },
      {
        // Useful for determining whether we’re running in production mode.
        // Most importantly, it switches React into the correct mode.
        NODE_ENV: JSON.stringify(environment),

        // Useful for resolving the correct path to static assets in `public`.
        // For example, <img src={process.env.PUBLIC_URL + '/img/logo.png'} />.
        // This should only be used as an escape hatch. Normally you would put
        // images into the root folder and `import` them in code to get their paths.
        PUBLIC_URL: JSON.stringify(publicUrl),

        // Surface the manifest for use in expo-constants
        APP_MANIFEST: JSON.stringify(getAppManifest()),
      }
    );
  return {
    'process.env': processEnv,
    __DEV__,
  };
}

function generateHTMLFromAppJSON() {
  const { expo: expoManifest = {} } = nativeAppManifest;
  const { web: expoManifestWebManifest = {} } = expoManifest;

  const favicon = expoManifestWebManifest.favicon;

  const metaTags = {
    viewport: 'width=device-width, initial-scale=1, shrink-to-fit=no',
    description: expoManifest.description || 'A Neat Expo App',
    'theme-color': expoManifest.primaryColor || '#000000',
    'apple-mobile-web-app-capable': 'yes',
    // default, black, black-translucent
    'apple-mobile-web-app-status-bar-style': 'default',
    'apple-mobile-web-app-title': expoManifest.name,
    'application-name': expoManifest.name,
    // Windows
    'msapplication-navbutton-color': '',
    'msapplication-TileColor': '',
    'msapplication-TileImage': '',
  };

  // Generates an `index.html` file with the <script> injected.
  return new HtmlWebpackPlugin({
    /**
     * The file to write the HTML to.
     * You can specify a subdirectory here too (eg: `assets/admin.html`).
     * Default: `'index.html'`.
     */
    filename: locations.absolute(`${productionPath}/index.html`),
    /**
     * The title to use for the generated HTML document.
     * Default: `'Webpack App'`.
     */
    title: expoManifest.name,
    /**
     * Pass a html-minifier options object to minify the output.
     * https://github.com/kangax/html-minifier#options-quick-reference
     * Default: `false`.
     */
    minify: {
      removeComments: true,
    },
    /**
     * Adds the given favicon path to the output html.
     * Default: `false`.
     */
    favicon,
    /**
     * Allows to inject meta-tags, e.g. meta: `{viewport: 'width=device-width, initial-scale=1, shrink-to-fit=no'}`.
     * Default: `{}`.
     */
    meta: metaTags,
    /**
     * The `webpack` require path to the template.
     * @see https://github.com/jantimon/html-webpack-plugin/blob/master/docs/template-option.md
     */
    template: locations.rootHtml,
  });
}

const env = getClientEnvironment(publicUrl);

const includeModule = module => {
  return path.resolve(locations.modules, module);
};

// Only compile files from react-native, and expo libraries.
const includeModulesThatContainPaths = [
  'node_modules/react-native',
  'node_modules/react-navigation',
  'node_modules/expo',
  'node_modules/@react',
  'node_modules/@expo/',
  // Special case for this app
  'apps/native-component-list',
];

const babelLoaderConfiguration = {
  test: /\.jsx?$/,
  include(inputPath) {
    for (const option of includeModulesThatContainPaths) {
      if (inputPath.includes(option)) {
        return inputPath;
      }
    }
    return null;
  },
  use: {
    loader: 'babel-loader',
    options: {
      babelrc: false,
    },
  },
};

// This is needed for webpack to import static images in JavaScript files.
const imageLoaderConfiguration = {
  test: /\.(gif|jpe?g|png|svg)$/,
  use: {
    loader: 'url-loader',
    options: {
      limit: 10000,
      name: '[name].[ext]',
    },
  },
};

// This is needed for loading css
const cssLoaderConfiguration = {
  test: /\.css$/,
  use: ['style-loader', 'css-loader'],
};

const ttfLoaderConfiguration = {
  test: /\.ttf$/,
  use: [
    {
      loader: 'file-loader',
      options: {
        name: './fonts/[hash].[ext]',
      },
    },
  ],
  include: [
    locations.root,
    includeModule('react-native-vector-icons'),
    includeModule('@expo/vector-icons'),
  ],
};

const htmlLoaderConfiguration = {
  test: /\.html$/,
  use: ['html-loader'],
  include: [locations.absolute('./assets')],
};

const mediaLoaderConfiguration = {
  test: /\.(mov|mp4|mp3|wav)$/,
  use: [
    {
      loader: 'file-loader',
      options: {
        name: '[path][name].[ext]',
      },
    },
  ],
};

// This method intercepts modules being referenced in react-native
// and redirects them to web friendly versions in expo.
function getWebModule(initialRoot, moduleName) {
  return function(res) {
    if (res.context.includes('node_modules/react-native/')) {
      res.request = includeModule(initialRoot + moduleName);
    }
  };
}

function useWebModule(modulePathToHiJack, redirectPath, initialRoot = 'expo/build/web/') {
  return new webpack.NormalModuleReplacementPlugin(
    new RegExp(modulePathToHiJack),
    getWebModule(initialRoot, redirectPath)
  );
}

const publicPath = '/';

module.exports = {
  mode: environment,
  devtool: 'cheap-module-source-map',
  // configures where the build ends up
  output: {
    path: locations.absolute(productionPath),
    filename: 'bundle.js',

    // filename: '[name].[contenthash].js',
    // There are also additional JS chunk files if you use code splitting.
    chunkFilename: '[name].chunk.js',
    // This is the URL that app is served from. We use "/" in development.
    publicPath,
  },
  optimization: {
    runtimeChunk: true,

    // runtimeChunk: 'single',
    // splitChunks: {
    //   cacheGroups: {
    //     vendor: {
    //       test: /[\\/]node_modules[\\/]/,
    //       name: 'vendors',
    //       chunks: 'all',
    //     },
    //   },
    // },
  },
  module: {
    rules: [
      { parser: { requireEnsure: false } },

      htmlLoaderConfiguration,
      babelLoaderConfiguration,
      cssLoaderConfiguration,
      imageLoaderConfiguration,
      ttfLoaderConfiguration,
      mediaLoaderConfiguration,
    ],
  },
  plugins: [
    // Generates an `index.html` file with the <script> injected.
    generateHTMLFromAppJSON(),

    new InterpolateHtmlPlugin(HtmlWebpackPlugin, {
      PUBLIC_URL: publicUrl,
      WEB_TITLE: nativeAppManifest.expo.name,
      // SERVICE_WORKER: ``,
    }),
    // Generate a manifest file which contains a mapping of all asset filenames
    // to their corresponding output file so that tools can pick it up without
    // having to parse `index.html`.
    new ManifestPlugin({
      fileName: 'asset-manifest.json',
      publicPath,
    }),

    new webpack.DefinePlugin(env),

    useWebModule('Platform', 'Utilities/Platform'),
    useWebModule('Performance/Systrace', 'Performance/Systrace'),
    useWebModule('HMRLoadingView', 'Utilities/HMRLoadingView'),
    useWebModule('RCTNetworking', 'Network/RCTNetworking'),

    new webpack.HashedModuleIdsPlugin(),
    new WorkboxPlugin.GenerateSW(),
  ],
  resolve: {
    symlinks: false,
    extensions: ['.web.js', '.js', '.jsx', '.json'],
    alias: {
      /* Alias direct react-native imports to react-native-web */
      'react-native$': 'react-native-web',
      /* Add polyfills for modules that react-native-web doesn't support */
      'react-native/Libraries/Image/AssetSourceResolver$':
        'expo/build/web/Image/AssetSourceResolver',
      'react-native/Libraries/Image/assetPathUtils$': 'expo/build/web/Image/assetPathUtils',
      'react-native/Libraries/Image/resolveAssetSource$': 'expo/build/web/Image/resolveAssetSource',
    },
  },
  // Some libraries import Node modules but don't use them in the browser.
  // Tell Webpack to provide empty mocks for them so importing them works.
  node: {
    dgram: 'empty',
    fs: 'empty',
    net: 'empty',
    tls: 'empty',
    child_process: 'empty',
  },
};
