This is the player for the Cinevva Game Engine https://app.cinevva.com/

You can use it to build portable HTML packs for your video games created with the Cinevva Engine.

The player also utilizes Capacitor by Ionic to publish your games on mobile platforms.

* Create a pack of your game assets by visiting `https://app.cinevva.com/api/projects/<your_game_id>/assets/pack.zip`
* Unzip it to `public/assets/pack`
* Run `npm run dev` to run it in a browser
* Run `npm run build` to create a downloadable package in `dist` directory

Player requires a runtime repo that can be cloned at https://github.com/Cinevva-Inc/vio-core
If you put these two repos next to each other, create a symlink by running the following command from the parent directory:
`ln  -s ../../vio-core vio-play/src/core`
If your OS doesn't support symlinks, just copy vio-core into vio-play/src under the core name.

> **Gamedev.js Jam 2024 participants**: to rebuild the **Mark Yeager and Genesis Vault** game submission, download the game assets pack at https://app.cinevva.com/api/projects/mzb4xt0m1ts/assets/pack.zip. Please note that some of the assets in this pack are licensed from amazing collections of Polygon packs at https://syntystore.com/products/. If you want to create your games using these assets, please purchase them from this store. You can see all aspects of this game in the online editor at https://app.cinevva.com/edit/mzb4xt0m1ts.

*Please vote for our game at https://itch.io/jam/gamedevjs-2024/rate/2672249!*
