import 'nx/src/internal-testing-utils/mock-project-graph';

import { getInstalledCypressMajorVersion } from '@nx/cypress/src/utils/versions';
import {
  readNxJson,
  readProjectConfiguration,
  Tree,
  updateJson,
  updateNxJson,
  writeJson,
} from '@nx/devkit';
import { getProjects, readJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import * as devkitExports from 'nx/src/devkit-exports';

import { applicationGenerator } from './application';
import { Schema } from './schema';
import { PackageManagerCommands } from 'nx/src/utils/package-manager';
// need to mock cypress otherwise it'll use the nx installed version from package.json
//  which is v9 while we are testing for the new v10 version
jest.mock('@nx/cypress/src/utils/versions', () => ({
  ...jest.requireActual('@nx/cypress/src/utils/versions'),
  getInstalledCypressMajorVersion: jest.fn(),
}));
jest.mock('@nx/devkit', () => {
  return {
    ...jest.requireActual('@nx/devkit'),
    ensurePackage: jest.fn((pkg) => jest.requireActual(pkg)),
  };
});

describe('app', () => {
  let tree: Tree;
  let mockedInstalledCypressVersion: jest.Mock<
    ReturnType<typeof getInstalledCypressMajorVersion>
  > = getInstalledCypressMajorVersion as never;
  beforeEach(() => {
    mockedInstalledCypressVersion.mockReturnValue(10);
    jest
      .spyOn(devkitExports, 'getPackageManagerCommand')
      .mockReturnValue({ exec: 'npx' } as PackageManagerCommands);

    tree = createTreeWithEmptyWorkspace();
  });

  describe('not nested', () => {
    it('should update configuration', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        addPlugin: true,
      });
      expect(readProjectConfiguration(tree, 'my-app').root).toEqual('my-app');
      expect(readProjectConfiguration(tree, 'my-app-e2e').root).toEqual(
        'my-app-e2e'
      );
    }, 60_000);

    it('should update tags and implicit dependencies', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        tags: 'one,two',
        addPlugin: true,
      });
      const projects = Object.fromEntries(getProjects(tree));
      expect(projects).toMatchObject({
        'my-app': {
          tags: ['one', 'two'],
        },
        'my-app-e2e': {
          tags: [],
          implicitDependencies: ['my-app'],
        },
      });
    }, 60_000);

    it('should generate files', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        addPlugin: true,
      });
      expect(tree.exists('my-app/src/main.ts')).toBeTruthy();
      expect(tree.exists('my-app/src/app/app.element.ts')).toBeTruthy();
      expect(tree.exists('my-app/src/app/app.element.spec.ts')).toBeTruthy();
      expect(tree.exists('my-app/src/app/app.element.css')).toBeTruthy();

      const tsconfig = readJson(tree, 'my-app/tsconfig.json');
      expect(tsconfig.extends).toBe('../tsconfig.base.json');
      expect(tsconfig.references).toEqual([
        {
          path: './tsconfig.app.json',
        },
        {
          path: './tsconfig.spec.json',
        },
      ]);

      const tsconfigApp = readJson(tree, 'my-app/tsconfig.app.json');
      expect(tsconfigApp.compilerOptions.outDir).toEqual('../dist/out-tsc');
      expect(tsconfigApp.extends).toEqual('./tsconfig.json');

      expect(tree.exists('my-app-e2e/playwright.config.ts')).toBeTruthy();
      const tsconfigE2E = readJson(tree, 'my-app-e2e/tsconfig.json');
      expect(tsconfigE2E).toMatchInlineSnapshot(`
        {
          "compilerOptions": {
            "allowJs": true,
            "module": "commonjs",
            "outDir": "../dist/out-tsc",
            "sourceMap": false,
          },
          "extends": "../tsconfig.base.json",
          "include": [
            "**/*.ts",
            "**/*.js",
            "playwright.config.ts",
            "src/**/*.spec.ts",
            "src/**/*.spec.js",
            "src/**/*.test.ts",
            "src/**/*.test.js",
            "src/**/*.d.ts",
          ],
        }
      `);

      const eslintJson = readJson(tree, '/my-app/.eslintrc.json');
      expect(eslintJson).toMatchInlineSnapshot(`
        {
          "extends": [
            "../.eslintrc.json",
          ],
          "ignorePatterns": [
            "!**/*",
          ],
          "overrides": [
            {
              "files": [
                "*.ts",
                "*.tsx",
                "*.js",
                "*.jsx",
              ],
              "rules": {},
            },
            {
              "files": [
                "*.ts",
                "*.tsx",
              ],
              "rules": {},
            },
            {
              "files": [
                "*.js",
                "*.jsx",
              ],
              "rules": {},
            },
          ],
        }
      `);
    });

    it('should setup playwright e2e project', async () => {
      await applicationGenerator(tree, {
        directory: 'cool-app',
        e2eTestRunner: 'playwright',
        unitTestRunner: 'none',
        addPlugin: true,
      });
      expect(tree.exists('cool-app-e2e/playwright.config.ts')).toBeTruthy();
    });

    it('should setup cypress e2e project correctly for vite', async () => {
      await applicationGenerator(tree, {
        directory: 'cool-app',
        e2eTestRunner: 'cypress',
        unitTestRunner: 'none',
        bundler: 'vite',
        addPlugin: true,
      });
      expect(tree.read('cool-app-e2e/cypress.config.ts', 'utf-8'))
        .toMatchInlineSnapshot(`
        "import { nxE2EPreset } from '@nx/cypress/plugins/cypress-preset';
        import { defineConfig } from 'cypress';

        export default defineConfig({
          e2e: {
            ...nxE2EPreset(__filename, {
              cypressDir: 'src',
              bundler: 'vite',
              webServerCommands: {
                default: 'npx nx run cool-app:dev',
                production: 'npx nx run cool-app:preview',
              },
              ciWebServerCommand: 'npx nx run cool-app:preview',
              ciBaseUrl: 'http://localhost:4300',
            }),
            baseUrl: 'http://localhost:4200',
          },
        });
        "
      `);
    });

    it('should setup cypress e2e project correctly for webpack', async () => {
      await applicationGenerator(tree, {
        directory: 'cool-app',
        e2eTestRunner: 'cypress',
        unitTestRunner: 'none',
        bundler: 'webpack',
        addPlugin: true,
      });
      expect(tree.read('cool-app-e2e/cypress.config.ts', 'utf-8'))
        .toMatchInlineSnapshot(`
        "import { nxE2EPreset } from '@nx/cypress/plugins/cypress-preset';
        import { defineConfig } from 'cypress';

        export default defineConfig({
          e2e: {
            ...nxE2EPreset(__filename, {
              cypressDir: 'src',
              webServerCommands: {
                default: 'npx nx run cool-app:serve',
                production: 'npx nx run cool-app:serve-static',
              },
              ciWebServerCommand: 'npx nx run cool-app:serve-static',
              ciBaseUrl: 'http://localhost:4200',
            }),
            baseUrl: 'http://localhost:4200',
          },
        });
        "
      `);
    });

    it('should setup playwright e2e project correctly for webpack', async () => {
      await applicationGenerator(tree, {
        directory: 'cool-app',
        e2eTestRunner: 'playwright',
        unitTestRunner: 'none',
        bundler: 'webpack',
        addPlugin: true,
      });
      expect(
        tree.read('cool-app-e2e/playwright.config.ts', 'utf-8')
      ).toMatchSnapshot();
    });

    it('should generate files if bundler is vite', async () => {
      const nxJson = readNxJson(tree);
      nxJson.plugins ??= [];
      nxJson.plugins.push({
        plugin: '@nx/vite/plugin',
        options: {
          buildTargetName: 'build',
          previewTargetName: 'preview',
        },
      });
      updateNxJson(tree, nxJson);
      await applicationGenerator(tree, {
        directory: 'my-app',
        bundler: 'vite',
        e2eTestRunner: 'playwright',
        addPlugin: true,
      });
      expect(tree.exists('my-app/src/main.ts')).toBeTruthy();
      expect(tree.exists('my-app/src/app/app.element.ts')).toBeTruthy();
      expect(tree.exists('my-app/src/app/app.element.spec.ts')).toBeTruthy();
      expect(tree.exists('my-app/src/app/app.element.css')).toBeTruthy();

      const tsconfig = readJson(tree, 'my-app/tsconfig.json');
      expect(tsconfig.extends).toBe('../tsconfig.base.json');
      expect(tsconfig.references).toEqual([
        {
          path: './tsconfig.app.json',
        },
        {
          path: './tsconfig.spec.json',
        },
      ]);
      expect(
        tree.read('my-app-e2e/playwright.config.ts', 'utf-8')
      ).toMatchSnapshot();
      expect(tree.exists('my-app/index.html')).toBeTruthy();
      expect(tree.exists('my-app/vite.config.ts')).toBeTruthy();
      expect(tree.exists(`my-app/environments/environment.ts`)).toBeFalsy();
      expect(
        tree.exists(`my-app/environments/environment.prod.ts`)
      ).toBeFalsy();
    });

    it('should use serve target and port if bundler=vite, e2eTestRunner=playwright, addPlugin=false', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        bundler: 'vite',
        e2eTestRunner: 'playwright',
      });
      expect(
        tree.read('my-app-e2e/playwright.config.ts', 'utf-8')
      ).toMatchSnapshot();
    });

    it('should extend from root tsconfig.json when no tsconfig.base.json', async () => {
      tree.rename('tsconfig.base.json', 'tsconfig.json');

      await applicationGenerator(tree, {
        directory: 'my-app',
        addPlugin: true,
      });

      const tsconfig = readJson(tree, 'my-app/tsconfig.json');
      expect(tsconfig.extends).toBe('../tsconfig.json');
    });
  });

  describe('nested', () => {
    it('should update configuration', async () => {
      await applicationGenerator(tree, {
        directory: 'my-dir/my-app',
        addPlugin: true,
      });
      expect(readProjectConfiguration(tree, 'my-app').root).toEqual(
        'my-dir/my-app'
      );
      expect(readProjectConfiguration(tree, 'my-app-e2e').root).toEqual(
        'my-dir/my-app-e2e'
      );
    }, 60_000);

    it('should update tags and implicit dependencies', async () => {
      await applicationGenerator(tree, {
        directory: 'my-dir/my-app',
        tags: 'one,two',
        addPlugin: true,
      });
      const projects = Object.fromEntries(getProjects(tree));
      expect(projects).toMatchObject({
        'my-app': {
          tags: ['one', 'two'],
        },
        'my-app-e2e': {
          tags: [],
          implicitDependencies: ['my-app'],
        },
      });
    });

    it('should generate files', async () => {
      const hasJsonValue = ({ path, expectedValue, lookupFn }) => {
        const config = readJson(tree, path);

        expect(lookupFn(config)).toEqual(expectedValue);
      };
      await applicationGenerator(tree, {
        directory: 'my-dir/my-app',
        addPlugin: true,
      });

      // Make sure these exist
      [
        'my-dir/my-app/src/main.ts',
        'my-dir/my-app/src/app/app.element.ts',
        'my-dir/my-app/src/app/app.element.spec.ts',
        'my-dir/my-app/src/app/app.element.css',
      ].forEach((path) => {
        expect(tree.exists(path)).toBeTruthy();
      });

      // Make sure these have properties
      [
        {
          path: 'my-dir/my-app/tsconfig.app.json',
          lookupFn: (json) => json.compilerOptions.outDir,
          expectedValue: '../../dist/out-tsc',
        },
        {
          path: 'my-dir/my-app-e2e/tsconfig.json',
          lookupFn: (json) => json.compilerOptions.outDir,
          expectedValue: '../../dist/out-tsc',
        },
        {
          path: 'my-dir/my-app/.eslintrc.json',
          lookupFn: (json) => json.extends,
          expectedValue: ['../../.eslintrc.json'],
        },
      ].forEach(hasJsonValue);
    });

    it('should extend from root tsconfig.base.json', async () => {
      await applicationGenerator(tree, {
        directory: 'my-dir/my-app',
        addPlugin: true,
      });

      const tsconfig = readJson(tree, 'my-dir/my-app/tsconfig.json');
      expect(tsconfig.extends).toBe('../../tsconfig.base.json');
    });

    it('should extend from root tsconfig.json when no tsconfig.base.json', async () => {
      tree.rename('tsconfig.base.json', 'tsconfig.json');

      await applicationGenerator(tree, {
        directory: 'my-dir/my-app',
        addPlugin: true,
      });

      const tsconfig = readJson(tree, 'my-dir/my-app/tsconfig.json');
      expect(tsconfig.extends).toBe('../../tsconfig.json');
    });

    it('should create Nx specific template', async () => {
      await applicationGenerator(tree, {
        directory: 'my-dir/my-app',
        addPlugin: true,
      });
      expect(
        tree.read('my-dir/my-app/src/app/app.element.ts', 'utf-8')
      ).toBeTruthy();
      expect(
        tree.read('my-dir/my-app/src/app/app.element.ts', 'utf-8')
      ).toContain('Hello there');
    });
  });

  describe('--style scss', () => {
    it('should generate scss styles', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        style: 'scss',
        addPlugin: true,
      });
      expect(tree.exists('my-app/src/app/app.element.scss')).toEqual(true);
    });
  });

  it('should setup jest without serializers', async () => {
    await applicationGenerator(tree, {
      directory: 'my-app',
      addPlugin: true,
    });

    expect(tree.read('my-app/jest.config.ts', 'utf-8')).not.toContain(
      `'jest-preset-angular/build/AngularSnapshotSerializer.js',`
    );
  });

  it('should setup the web build builder', async () => {
    await applicationGenerator(tree, {
      directory: 'my-app',
      addPlugin: true,
    });
    expect(tree.read('my-app/webpack.config.js', 'utf-8')).toMatchSnapshot();
  });

  it('should setup the web dev server', async () => {
    await applicationGenerator(tree, {
      directory: 'my-app',
      addPlugin: true,
    });

    expect(tree.read('my-app/webpack.config.js', 'utf-8')).toMatchSnapshot();
  });

  it('should setup eslint', async () => {
    await applicationGenerator(tree, {
      directory: 'my-app',
      addPlugin: true,
    });
    expect(tree.read('my-app/.eslintrc.json', 'utf-8')).toMatchSnapshot();
  });

  describe('--prefix', () => {
    it('should use the prefix in the index.html', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        prefix: 'prefix',
        addPlugin: true,
      });

      expect(tree.read('my-app/src/index.html', 'utf-8')).toContain(
        '<prefix-root></prefix-root>'
      );
    });
  });

  describe('--unit-test-runner', () => {
    it('--unit-test-runner=none', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        unitTestRunner: 'none',
        addPlugin: true,
      });
      expect(tree.exists('jest.config.ts')).toBeFalsy();
      expect(tree.exists('my-app/src/app/app.element.spec.ts')).toBeFalsy();
      expect(tree.exists('my-app/tsconfig.spec.json')).toBeFalsy();
      expect(tree.exists('my-app/jest.config.ts')).toBeFalsy();
    });

    it('--bundler=none should use jest as the default', async () => {
      await applicationGenerator(tree, {
        directory: 'my-cool-app',
        bundler: 'none',
        addPlugin: true,
      });
      expect(tree.exists('my-cool-app/jest.config.ts')).toBeTruthy();
      expect(
        readJson(tree, 'my-cool-app/tsconfig.spec.json').compilerOptions.types
      ).toMatchInlineSnapshot(`
        [
          "jest",
          "node",
        ]
      `);
    });

    // Updated this test to match the way we do this for React
    // When user chooses Vite as bundler and they choose to generate unit tests
    // then use vitest
    it('--bundler=vite --unitTestRunner=jest respects unitTestRunner given', async () => {
      await applicationGenerator(tree, {
        directory: 'my-vite-app',

        bundler: 'vite',
        unitTestRunner: 'jest',
        addPlugin: true,
      });
      expect(tree.exists('my-vite-app/vite.config.ts')).toBeTruthy();
      expect(tree.exists('my-vite-app/jest.config.ts')).toBeTruthy();
    });

    it('--bundler=vite --unitTestRunner=none', async () => {
      await applicationGenerator(tree, {
        directory: 'my-vite-app',
        bundler: 'vite',
        unitTestRunner: 'none',
        addPlugin: true,
      });
      expect(tree.exists('my-vite-app/vite.config.ts')).toBeTruthy();
      expect(tree.read('my-vite-app/vite.config.ts', 'utf-8')).not.toContain(
        'test: {'
      );
      expect(tree.exists('my-vite-app/tsconfig.spec.json')).toBeFalsy();
    });

    it('--bundler=webpack --unitTestRunner=vitest', async () => {
      await applicationGenerator(tree, {
        directory: 'my-webpack-app',
        bundler: 'webpack',
        unitTestRunner: 'vitest',
        addPlugin: true,
      });
      expect(tree.exists('my-webpack-app/vite.config.ts')).toBeTruthy();
      expect(tree.exists('my-webpack-app/jest.config.ts')).toBeFalsy();
      expect(
        readJson(tree, 'my-webpack-app/tsconfig.spec.json').compilerOptions
          .types
      ).toMatchInlineSnapshot(`
        [
          "vitest/globals",
          "vitest/importMeta",
          "vite/client",
          "node",
          "vitest",
        ]
      `);
    });
  });

  describe('--e2e-test-runner none', () => {
    it('should not generate test configuration', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        e2eTestRunner: 'none',
        addPlugin: true,
      });
      expect(tree.exists('my-app-e2e')).toBeFalsy();
    });
  });

  describe('--compiler', () => {
    it('should support babel compiler', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        compiler: 'babel',
        addPlugin: true,
      } as Schema);

      expect(tree.read(`my-app/jest.config.ts`, 'utf-8'))
        .toMatchInlineSnapshot(`
        "export default {
          displayName: 'my-app',
          preset: '../jest.preset.js',
          setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
          transform: {
            '^.+\\\\.[tj]s$': 'babel-jest',
          },
          moduleFileExtensions: ['ts', 'js', 'html'],
          coverageDirectory: '../coverage/my-app',
        };
        "
      `);

      expect(tree.exists('my-app/.babelrc')).toBeTruthy();
      expect(tree.exists('my-app/.swcrc')).toBeFalsy();
    });

    it('should support swc compiler', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        compiler: 'swc',
        addPlugin: true,
      } as Schema);

      expect(tree.read(`my-app/jest.config.ts`, 'utf-8'))
        .toMatchInlineSnapshot(`
        "export default {
          displayName: 'my-app',
          preset: '../jest.preset.js',
          setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
          transform: {
            '^.+\\\\.[tj]s$': '@swc/jest',
          },
          moduleFileExtensions: ['ts', 'js', 'html'],
          coverageDirectory: '../coverage/my-app',
        };
        "
      `);

      expect(tree.exists('my-app/.babelrc')).toBeFalsy();
      expect(tree.exists('my-app/.swcrc')).toBeTruthy();
    });

    it('should be strict by default', async () => {
      await applicationGenerator(tree, {
        directory: 'my-app',
        compiler: 'swc',
        addPlugin: true,
      } as Schema);

      const tsconfig = readJson(tree, 'my-app/tsconfig.json');
      expect(tsconfig.compilerOptions.strict).toBeTruthy();
    });
  });

  describe('setup web app with --bundler=vite', () => {
    let viteAppTree: Tree;
    beforeAll(async () => {
      viteAppTree = createTreeWithEmptyWorkspace();
      await applicationGenerator(viteAppTree, {
        directory: 'my-app',
        bundler: 'vite',
        addPlugin: true,
      });
    });

    it('should setup vite configuration', () => {
      expect(tree.read('my-app/vite.config.ts', 'utf-8')).toMatchSnapshot();
    });
    it('should add dependencies in package.json', () => {
      const packageJson = readJson(viteAppTree, '/package.json');

      expect(packageJson.devDependencies).toMatchObject({
        vite: expect.any(String),
      });
    });

    it('should create correct tsconfig compilerOptions', () => {
      const tsconfigJson = readJson(viteAppTree, '/my-app/tsconfig.json');
      expect(tsconfigJson.compilerOptions.noImplicitReturns).toBeTruthy();
    });

    it('should create index.html and vite.config file at the root of the app', () => {
      expect(viteAppTree.exists('/my-app/index.html')).toBe(true);
      expect(viteAppTree.exists('/my-app/vite.config.ts')).toBe(true);
    });

    it('should not include a spec file when the bundler or unitTestRunner is vite and insourceTests is false', async () => {
      expect(viteAppTree.exists('/my-app/src/app/app.element.spec.ts')).toBe(
        true
      );

      await applicationGenerator(viteAppTree, {
        directory: 'insourceTests',
        bundler: 'vite',
        inSourceTests: true,
        addPlugin: true,
      });

      expect(
        viteAppTree.exists('/insource-tests/src/app/app.element.spec.ts')
      ).toBe(false);
    });
  });

  describe('--bundler=webpack', () => {
    it('should configure webpack correctly', async () => {
      await applicationGenerator(tree, {
        directory: 'apps/my-app',
        bundler: 'webpack',
        addPlugin: true,
        skipFormat: true,
      });

      expect(tree.read('apps/my-app/webpack.config.js', 'utf-8'))
        .toMatchInlineSnapshot(`
        "
        const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
        const { join } = require('path');

        module.exports = {
          output: {
            path: join(__dirname, '../../dist/apps/my-app'),
          },
          devServer: {
            port: 4200
          },
          plugins: [
            new NxAppWebpackPlugin({
              tsConfig: './tsconfig.app.json',
              compiler: 'babel',
              main: './src/main.ts',
              index: './src/index.html',
              baseHref: '/',
              assets: ["./src/favicon.ico","./src/assets"],
              styles: ["./src/styles.css"],
              outputHashing: process.env['NODE_ENV'] === 'production' ? 'all' : 'none',
              optimization: process.env['NODE_ENV'] === 'production',
            })
          ],
        };

        "
      `);
    });
  });

  describe('TS solution setup', () => {
    beforeEach(() => {
      tree = createTreeWithEmptyWorkspace();
      updateJson(tree, 'package.json', (json) => {
        json.workspaces = ['packages/*', 'apps/*'];
        return json;
      });
      writeJson(tree, 'tsconfig.base.json', {
        compilerOptions: {
          composite: true,
          declaration: true,
        },
      });
      writeJson(tree, 'tsconfig.json', {
        extends: './tsconfig.base.json',
        files: [],
        references: [],
      });
    });

    it('should add project references when using TS solution', async () => {
      await applicationGenerator(tree, {
        directory: 'apps/myapp',
        addPlugin: true,
        linter: 'none',
        style: 'none',
        bundler: 'vite',
        unitTestRunner: 'vitest',
        e2eTestRunner: 'playwright',
        useProjectJson: false,
      });

      expect(readJson(tree, 'tsconfig.json').references).toMatchInlineSnapshot(`
        [
          {
            "path": "./apps/myapp-e2e",
          },
          {
            "path": "./apps/myapp",
          },
        ]
      `);
      const packageJson = readJson(tree, 'apps/myapp/package.json');
      expect(packageJson.name).toBe('@proj/myapp');
      expect(packageJson.nx).toBeUndefined();
      // Make sure keys are in idiomatic order
      expect(Object.keys(packageJson)).toMatchInlineSnapshot(`
        [
          "name",
          "version",
          "private",
        ]
      `);
      expect(readJson(tree, 'apps/myapp/tsconfig.json')).toMatchInlineSnapshot(`
        {
          "extends": "../../tsconfig.base.json",
          "files": [],
          "include": [],
          "references": [
            {
              "path": "./tsconfig.app.json",
            },
            {
              "path": "./tsconfig.spec.json",
            },
          ],
        }
      `);
      expect(readJson(tree, 'apps/myapp/tsconfig.app.json'))
        .toMatchInlineSnapshot(`
        {
          "compilerOptions": {
            "module": "esnext",
            "moduleResolution": "bundler",
            "outDir": "dist",
            "rootDir": "src",
            "tsBuildInfoFile": "dist/tsconfig.app.tsbuildinfo",
            "types": [
              "node",
            ],
          },
          "exclude": [
            "out-tsc",
            "dist",
            "src/**/*.spec.ts",
            "src/**/*.test.ts",
            "vite.config.ts",
            "vite.config.mts",
            "vitest.config.ts",
            "vitest.config.mts",
            "src/**/*.test.tsx",
            "src/**/*.spec.tsx",
            "src/**/*.test.js",
            "src/**/*.spec.js",
            "src/**/*.test.jsx",
            "src/**/*.spec.jsx",
          ],
          "extends": "../../tsconfig.base.json",
          "include": [
            "src/**/*.ts",
          ],
        }
      `);
      expect(readJson(tree, 'apps/myapp/tsconfig.spec.json'))
        .toMatchInlineSnapshot(`
        {
          "compilerOptions": {
            "module": "esnext",
            "moduleResolution": "bundler",
            "outDir": "./out-tsc/vitest",
            "types": [
              "vitest/globals",
              "vitest/importMeta",
              "vite/client",
              "node",
              "vitest",
            ],
          },
          "extends": "../../tsconfig.base.json",
          "include": [
            "vite.config.ts",
            "vite.config.mts",
            "vitest.config.ts",
            "vitest.config.mts",
            "src/**/*.test.ts",
            "src/**/*.spec.ts",
            "src/**/*.test.tsx",
            "src/**/*.spec.tsx",
            "src/**/*.test.js",
            "src/**/*.spec.js",
            "src/**/*.test.jsx",
            "src/**/*.spec.jsx",
            "src/**/*.d.ts",
          ],
          "references": [
            {
              "path": "./tsconfig.app.json",
            },
          ],
        }
      `);
      expect(readJson(tree, 'apps/myapp-e2e/tsconfig.json'))
        .toMatchInlineSnapshot(`
        {
          "compilerOptions": {
            "allowJs": true,
            "outDir": "out-tsc/playwright",
            "sourceMap": false,
          },
          "exclude": [
            "out-tsc",
            "test-output",
          ],
          "extends": "../../tsconfig.base.json",
          "include": [
            "**/*.ts",
            "**/*.js",
            "playwright.config.ts",
            "src/**/*.spec.ts",
            "src/**/*.spec.js",
            "src/**/*.test.ts",
            "src/**/*.test.js",
            "src/**/*.d.ts",
          ],
        }
      `);
    });

    it('should configure webpack correctly with the output contained within the project root', async () => {
      await applicationGenerator(tree, {
        directory: 'apps/my-app',
        bundler: 'webpack',
        addPlugin: true,
        useProjectJson: false,
        skipFormat: true,
      });

      expect(tree.read('apps/my-app/webpack.config.js', 'utf-8'))
        .toMatchInlineSnapshot(`
        "
        const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
        const { join } = require('path');

        module.exports = {
          output: {
            path: join(__dirname, 'dist'),
          },
          devServer: {
            port: 4200
          },
          plugins: [
            new NxAppWebpackPlugin({
              tsConfig: './tsconfig.app.json',
              compiler: 'babel',
              main: './src/main.ts',
              index: './src/index.html',
              baseHref: '/',
              assets: ["./src/favicon.ico","./src/assets"],
              styles: ["./src/styles.css"],
              outputHashing: process.env['NODE_ENV'] === 'production' ? 'all' : 'none',
              optimization: process.env['NODE_ENV'] === 'production',
            })
          ],
        };

        "
      `);
    });

    it('should respect the provided name', async () => {
      await applicationGenerator(tree, {
        directory: 'apps/myapp',
        name: 'myapp',
        addPlugin: true,
        linter: 'none',
        style: 'none',
        bundler: 'vite',
        unitTestRunner: 'vitest',
        e2eTestRunner: 'playwright',
        useProjectJson: false,
      });

      const packageJson = readJson(tree, 'apps/myapp/package.json');
      expect(packageJson.name).toBe('@proj/myapp');
      expect(packageJson.nx.name).toBe('myapp');
      // Make sure keys are in idiomatic order
      expect(Object.keys(packageJson)).toMatchInlineSnapshot(`
        [
          "name",
          "version",
          "private",
          "nx",
        ]
      `);
    });

    it('should generate project.json if useProjectJson is true', async () => {
      await applicationGenerator(tree, {
        directory: 'apps/myapp',
        addPlugin: true,
        useProjectJson: true,
        skipFormat: true,
      });

      expect(tree.exists('apps/myapp/project.json')).toBeTruthy();
      expect(readProjectConfiguration(tree, '@proj/myapp'))
        .toMatchInlineSnapshot(`
        {
          "$schema": "../../node_modules/nx/schemas/project-schema.json",
          "name": "@proj/myapp",
          "projectType": "application",
          "root": "apps/myapp",
          "sourceRoot": "apps/myapp/src",
          "tags": [],
          "targets": {},
        }
      `);
      expect(readJson(tree, 'apps/myapp/package.json').nx).toBeUndefined();
      expect(tree.exists('apps/myapp-e2e/project.json')).toBeTruthy();
      expect(readProjectConfiguration(tree, '@proj/myapp-e2e'))
        .toMatchInlineSnapshot(`
        {
          "$schema": "../../node_modules/nx/schemas/project-schema.json",
          "implicitDependencies": [
            "@proj/myapp",
          ],
          "name": "@proj/myapp-e2e",
          "projectType": "application",
          "root": "apps/myapp-e2e",
          "sourceRoot": "apps/myapp-e2e/src",
          "tags": [],
          "targets": {},
        }
      `);
      expect(readJson(tree, 'apps/myapp-e2e/package.json').nx).toBeUndefined();
    });
  });
});
