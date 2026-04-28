# Freelens Karpenter Extension

[Freelens](https://freelens.app) extension for [Karpenter](https://karpenter.sh/).  

A visual interface to monitor Karpenter's resources and the actions it performs.  

Born from an idea by Roberto Bandini [@robertobandini](https://github.com/robertobandini) and Alberto Lunghi [@albyrex](https://github.com/albyrex), who created the first version.

## Build from the source

### Prerequisites

Use [NVM](https://github.com/nvm-sh/nvm) or
[mise-en-place](https://mise.jdx.dev/) or
[windows-nvm](https://github.com/coreybutler/nvm-windows) to install the
required Node.js version.

From the root of this repository:

```sh
nvm install
# or
mise install
# or
winget install CoreyButler.NVMforWindows
nvm install 22.14.0
nvm use 22.14.0
```

Install Pnpm:

```sh
corepack install
# or
curl -fsSL https://get.pnpm.io/install.sh | sh -
# or
winget install pnpm.pnpm
```

### Build extension

```sh
corepack pnpm i
corepack pnpm build
corepack pnpm pack
```

### Install built extension

The tarball for the extension will be placed in the current directory.<br />
In Freelens, navigate to the Extensions list and provide the path to the tarball
to be loaded, or drag and drop the extension tarball into the Freelens window.
After loading for a moment, the extension should appear in the list of enabled
extensions.

## License

Copyright (c) 2025-2026 Freelens Authors.



[MIT License](https://opensource.org/licenses/MIT)
