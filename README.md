This is the player for the Cinevva Game Engine https://app.cinevva.com/

You can use it to build portable HTML packs for your video games created with the Cinevva Engine.

The player also utilizes Capacitor by Ionic to publish your games on mobile platforms.

* Create a pack of your game assets by visiting `https://app.cinevva.com/api/projects/<your_game_id>/assets/pack.zip`
* Unzip it to public/assets/pack
* Run npm run dev to run it in a browser
* Run npm run build to create a downloadable package in dist

Player requires a runtime repo that can be cloned at https://github.com/Cinevva-Inc/vio-core
If you put these two repos next to each other, create a symlink by running the following command from the parent directory:
`ln  -s ../../vio-core vio-play/src/core`
If your OS doesn't support symlinks, just copy vio-core into vio-play/src under the core name.
