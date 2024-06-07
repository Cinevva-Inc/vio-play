build:
	ionic build
	rclone sync dist r2:play
fetch:
	curl -s https://app.cinevva.com/api/projects/mzb4xt0m1ts/assets/pack.zip | bsdtar -xvf- -C public