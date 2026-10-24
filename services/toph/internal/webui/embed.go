package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var content embed.FS

const Placeholder = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Toph</title>
    <style>
      body { background:#0F120D; color:#EEF1E8; font-family:system-ui,sans-serif; display:grid; place-items:center; height:100vh; margin:0; }
      main { text-align:center; }
      strong { color:#A8C66C; font-size:42px; }
      code { color:#D4A24C; }
    </style>
  </head>
  <body>
    <main>
      <strong>T</strong>
      <h1>Toph</h1>
      <p>Build the web client with <code>make web</code>.</p>
    </main>
  </body>
</html>`

func FS() fs.FS {
	sub, err := fs.Sub(content, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
