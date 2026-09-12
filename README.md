# 排尿・尿意記録PWA

iPhoneで排尿、尿意、水分、睡眠を簡単に記録するためのサーバー不要PWAです。データはブラウザ内のLocalStorageに保存され、外部サーバーには送信されません。

## ファイル構成

- `index.html`: アプリ本体のHTML
- `styles.css`: iPhone向けレイアウト、明るいベージュ系テーマ、印刷用CSS
- `app.js`: 記録、編集、削除、集計、グラフ、JSON入出力
- `manifest.json`: PWA設定
- `service-worker.js`: オフライン動作用キャッシュ
- `icons/`: ホーム画面追加用アイコン

## ローカルでの起動方法

このフォルダで確認用の簡易サーバーを起動します。外部パッケージは不要です。

```powershell
node server.js
```

その後、ブラウザで開きます。

```text
http://localhost:4173/
```

`index.html`を直接開いても基本操作はできますが、PWAのService WorkerはHTTP/HTTPS上で動作します。

## iPhoneで開く方法

同じWi-Fi内のPCでサーバーを起動し、PCのローカルIPアドレスを使ってSafariで開きます。

```text
http://PCのIPアドレス:4173/
```

例:

```text
http://192.168.1.10:4173/
```

## PWAとしてホーム画面に追加する方法

1. iPhoneのSafariでアプリURLを開く
2. 共有ボタンをタップ
3. 「ホーム画面に追加」を選ぶ
4. 名前を確認して「追加」をタップ

ホーム画面から起動すると、通常のアプリに近い表示で使えます。

## LocalStorageのデータ構造

保存キー:

```text
urinationTracker.data.v1
```

基本構造:

```json
{
  "version": 1,
  "updatedAt": "2026-09-12T12:00:00.000Z",
  "records": [
    {
      "id": "uuid",
      "type": "void",
      "timestamp": "2026-09-12T05:44:00.000Z",
      "data": {
        "volumeLabel": "少量",
        "measuredMl": "",
        "urgeBefore": "3",
        "afterFeeling": "少し尿意あり",
        "pain": "0",
        "note": ""
      },
      "createdAt": "2026-09-12T05:44:00.000Z",
      "updatedAt": "2026-09-12T05:44:00.000Z"
    }
  ]
}
```

`type`の種類:

- `void`: 排尿
- `urge`: 尿意だけ
- `fluid`: 水分
- `sleep_start`: 就寝
- `sleep_end`: 起床

尿量は主観的なラベルとして保存し、mL換算はしません。実測値を入力した場合のみ`measuredMl`に保存します。

## JSONバックアップの方法

アプリの「設定」タブから操作します。

- `JSONをエクスポート`: 現在のデータをJSONファイルとして保存
- `JSONを追加インポート`: 保存済みJSONを現在のデータに追加。同じ記録はスキップ

Safariのデータ削除、機種変更、別端末での確認前にはエクスポートしておくと安心です。

## 注意

このアプリは診察時に経過を見せやすくするための記録ツールです。医学的な診断、正常・異常判定、通知による促しは行いません。
