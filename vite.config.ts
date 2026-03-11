import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
	plugins: [sveltekit()],
	define: {
		__BUILD_TIME__: JSON.stringify(
			(() => {
				const d = new Date();
				const stamp =
					d.toISOString().slice(0, 10).replace(/-/g, '') +
					'-' +
					d.toISOString().slice(11, 16).replace(':', '');
				return mode === 'development' ? stamp + '-dev' : stamp;
			})()
		),
	},
	test: {
		environment: 'happy-dom',
		globals: true,
		include: ['src/**/*.test.ts'],
	},
}));
