build:
	docker build -t tgbot .
run:
	docker run -d -p 3000:3000 --name tgbot --rm tgbot
restart:
	docker stop tgbot || true
	make build
	make run