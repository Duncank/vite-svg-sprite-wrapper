# vite-svg-sprite-wrapper

<p>
  <a href="https://npmjs.com/package/vite"><img src="https://img.shields.io/npm/v/vite-svg-sprite-wrapper.svg" alt="npm package"></a>
</p>

> [svg-sprite](https://github.com/svg-sprite/svg-sprite/) wrapper for [Vite](https://github.com/vitejs/vite)

## Install

```
npm i vite-svg-sprite-wrapper -D
```

## Usage

Add it to your plugins in `vite.config.ts`

```ts
import { defineConfig } from 'vite'
import ViteSvgSpriteWrapper from 'vite-svg-sprite-wrapper';

export default defineConfig({
  plugins: [
    ViteSvgSpriteWrapper({
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
    }),
  ],
})
```

Now, any changes to the .svg files in the `icons` folder will generate a `sprite.svg` in the `outputDir` folder.

So you can use the icons somehow ([Example](https://github.com/vshepel/vite-svg-sprite-wrapper/tree/master/example)):

```html
<svg class="icon" aria-hidden="true">
  <use xlink:href="/images/sprite.svg#star"></use>
</svg>
```

MIT License © 2023 [Volodymyr Shepel](https://github.com/vshepel)
