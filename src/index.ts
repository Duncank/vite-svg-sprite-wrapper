import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { cwd } from 'node:process'
import FastGlob from 'fast-glob'
import colors from 'picocolors'
import picomatch from 'picomatch'
import SVGSpriter from 'svg-sprite'
import { normalizePath, type PluginOption, type ResolvedConfig, type ViteDevServer } from 'vite'

export interface Options {
  /**
   * Input directory
   *
   * @default 'src/assets/images/svg/*.svg'
   */
  icons?: string
  /**
   * Output directory
   *
   * @default 'src/public/images'
   */
  outputDir?: string

  /**
   * sprite-svg {@link https://github.com/svg-sprite/svg-sprite/blob/main/docs/configuration.md#sprite-svg-options|options}
   */
  sprite?: SVGSpriter.Config
  /**
   * Defines if a type should be generated
   * @default false
   */
  generateType?: boolean
  /**
   * Name of the type to be used when generateType is set to true
   * @default 'SvgIcons'
   */
  typeName?: string
  /**
   * File name of the generated type file
   * @default 'svg-icons'
   */
  typeFileName?: string
  /**
   * Name of the output directory for generated type file
   * @default '{@link icons} directory'
   */
  typeOutputDir?: string
}

export const defaultOptions: Required<Options> = {
  icons: 'src/assets/images/svg/*.svg',
  outputDir: 'src/public/images',
  sprite: {},
  generateType: false,
  typeName: 'SvgIcons',
  typeFileName: 'svg-icons',
  typeOutputDir: '',
}

export function resolveOptions(options: Options) {
  return Object.assign({}, defaultOptions, options)
}

const root = cwd()
const isSvg = /\.svg$/

function normalizePaths(root: string, path: string | undefined): string[] {
  return (Array.isArray(path) ? path : [path])
    .map(path => resolve(root, path))
    .map(normalizePath)
}

function generateConfig(outputDir: string, options: Options): SVGSpriter.Config {
  return {
    dest: normalizePath(resolve(root, outputDir)),
    mode: {
      symbol: {
        sprite: '../sprite.svg',
      },
    },
    svg: {
      xmlDeclaration: false,
    },
    shape: {
      transform: [
        {
          svgo: {
            // @ts-expect-error [need to fix type for plugins property]
            plugins: [
              { name: 'preset-default' },
              {
                name: 'removeAttrs',
                params: {
                  attrs: ['*:(data-*|style|fill):*'],
                },
              },
              {
                name: 'addAttributesToSVGElement',
                params: {
                  attributes: [
                    { fill: 'currentColor' },
                  ],
                },
              },
              'removeXMLNS',
            ],
          },
        },
      ],
    },
    ...options.sprite,
  }
}

async function generateSvgSprite(options: Required<Options>): Promise<string> {
  const {
    icons,
    outputDir,
    generateType,
    typeName,
    typeFileName,
  } = options
  const spriter = new SVGSpriter(generateConfig(outputDir, options))
  const rootDir = icons.replace(/(\/(\*+))+\.(.+)/g, '')
  const entries = await FastGlob([icons])

  for (const entry of entries) {
    if (isSvg.test(entry)) {
      const relativePath = entry.replace(`${rootDir}/`, '')
      spriter.add(
        entry,
        relativePath,
        readFileSync(entry, { encoding: 'utf-8' }),
      )
    }
  }

  const { result, data } = await spriter.compileAsync()

  if (generateType) {
    const shapeIds: string[] = data.symbol.shapes.map(({ base }: { base: string }) => {
      return `'${base}'`
    })
    const fileComment = '/* this file was generated by vite-svg-sprite-wrapper */\n'
    const fileContent = `export type ${typeName} = ${shapeIds.join(' | ')}\n`
    const typeOutputDir = options.typeOutputDir || dirname(icons)

    if (!existsSync(typeOutputDir))
      mkdirSync(typeOutputDir, { recursive: true })

    writeFileSync(
      normalizePath(`${resolve(root, typeOutputDir)}/${typeFileName}.d.ts`),
      fileComment + fileContent,
    )
  }

  if (!existsSync(outputDir))
    mkdirSync(outputDir, { recursive: true })

  const sprite = result.symbol.sprite

  writeFileSync(
    sprite.path,
    sprite.contents.toString(),
  )

  return sprite.path.replace(root, '')
}

function ViteSvgSpriteWrapper(options: Options = {}): PluginOption {
  const resolved = resolveOptions(options)
  const { icons } = resolved
  let timer: number | undefined
  let config: ResolvedConfig

  function clear() {
    clearTimeout(timer)
  }
  function schedule(fn: () => void) {
    clear()
    timer = setTimeout(fn, 200) as any as number
  }

  const formatConsole = (msg: string) => `${colors.cyan('[vite-plugin-svg-sprite]')} ${msg}`
  const successGeneration = (res: string) => {
    config.logger.info(formatConsole(`Sprite generated ${colors.green(res)}`))
  }
  const failGeneration = (err: any) => {
    config.logger.info(formatConsole(`${colors.red('Sprite error')} ${colors.dim(err)}`))
  }

  return [
    {
      name: 'vite-plugin-svg-sprite:build',
      apply: 'build',
      configResolved(_config) {
        config = _config
      },
      enforce: 'pre',
      async buildStart() {
        await generateSvgSprite(resolved)
          .then((path) => {
            const name = basename(path)
            const source = readFileSync(`${root}${path}`)

            this.emitFile({
              name,
              source,
              type: 'asset',
            })

            successGeneration(path)
          })
          .catch(failGeneration)
      },
    },
    {
      name: 'vite-plugin-svg-sprite:serve',
      apply: 'serve',
      configResolved(_config) {
        config = _config
      },
      enforce: 'pre',
      async buildStart() {
        await generateSvgSprite(resolved)
          .then(successGeneration)
          .catch(failGeneration)
      },
      config: () => ({ server: { watch: { disableGlobbing: false } } }),
      configureServer({ watcher, hot }: ViteDevServer) {
        const iconsPath = normalizePaths(root, icons)
        const shouldReload = picomatch(iconsPath)
        const checkReload = (path: string) => {
          if (shouldReload(path)) {
            schedule(() => {
              generateSvgSprite(resolved)
                .then((res) => {
                  hot.send({ type: 'full-reload', path: '*' })
                  successGeneration(res)
                })
                .catch(failGeneration)
            })
          }
        }

        watcher.add(iconsPath)
        watcher.on('add', checkReload)
        watcher.on('change', checkReload)
        watcher.on('unlink', checkReload)
      },
    },
  ]
}

export default ViteSvgSpriteWrapper
