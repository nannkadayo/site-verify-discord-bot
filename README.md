# spam-protection-discord-bot


> [!NOTE]
> For instructions on how to use it, please check "Usage" below.  
> 使い方は、下の「Usage / 使い方」をご確認ください
> 

## Files / ファイル

|File Name / ファイル名|Description / 説明|
|---|---|
|`verify.config.js`|environmental variables 環境変数|
|`package.json`|package metadata パッケージメタデータ|
|`LICENSE`|License (copyright information) ライセンス(著作権情報)|

## Script Commands / スクリプトコマンド

|Command / コマンド|Description / 説明|
|---|---|
|`npm run dev`|launch the bot ボットを起動します|

## environmental variables / config (bot.config.js)

|variables name / 変数名|Description / 説明|
|---|---|
|`verify.token`|bot token / token|
|`verify.port`|bot port / 内部で使用するポート(かぶらなければ何でよ良い)|
|`verify.url`|bot URL / botの認証url|


## Usage / 使い方

### Setup / セットアップ

- run `npm install`
- edit `token` and `url` and `port` in file: `verify.config.js`

### Lunch / 起動

- run `npm run dev`

### Slashcommand / スラッシュコマンド

|Command / コマンド|Description / 説明|
|---|---|
|`/panel`|create panel / panelの設置|

