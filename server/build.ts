// build.ts
import { build, BuildOptions, Metafile } from 'esbuild';
import { nodeExternalsPlugin } from 'esbuild-node-externals';

// Get environment from CLI args or default to 'production'
const args = process.argv.slice(2);
const envArg = args.find(arg => arg.startsWith('--env='));
const env = envArg ? envArg.split('=')[1] : 'production';
const isProduction = env === 'production';

console.log(`\n🔧 Building for: ${env.toUpperCase()}\n`);

const options: BuildOptions = {
  entryPoints: ['./src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24', // Match your actual Node.js version
  outfile: './dist/server.js',
  format: 'cjs', // ESM build; switch to 'cjs' if needed
  minify: isProduction,
  sourcemap: !isProduction,
  define: {
    'process.env.NODE_ENV': JSON.stringify(env),
  },
  plugins: [nodeExternalsPlugin()],
  metafile: true
};

(async () => {
  try {
    const result = await build(options);
    console.log('✅ Build completed!\n');
    if (result.metafile) {
      reportBundleSize(result.metafile);
    }
  } catch (err) {
    console.error('❌ Build failed!\n');
    console.error(err);
    process.exit(1);
  }
})();

// Helper to print out bundle size info
function reportBundleSize(metafile: Metafile): void {
  console.log('📦 Bundle summary:');
  for (const file in metafile.outputs) {
    const size = metafile.outputs[file].bytes;
    console.log(` - ${file}: ${(size / 1024).toFixed(2)} KB`);
  }
}
