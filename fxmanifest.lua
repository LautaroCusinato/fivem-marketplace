fx_version 'cerulean'
game 'gta5'

author 'Lautaro'
description 'Tablet Marketplace'

-- LO MÁS IMPORTANTE: El orden.
shared_scripts {
    '@es_extended/imports.lua',
    '@ox_lib/init.lua',
    'config.lua' -- <--- Debe estar AQUÍ, antes que client y server
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
}

client_scripts {
    'client/client.lua'
}

server_scripts {
    'server/server.lua'
}