
.PHONY: all

all: requests.json
	../node_modules/.bin/ts-node run.ts ./requests.json ../engine.bin

requests.json:
	curl https://cdn.cliqz.com/adblocking/requests_top500.json.gz | gunzip > requests.json
