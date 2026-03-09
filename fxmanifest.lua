fx_version 'cerulean'
game 'gta5'

author 'Lautaro'
description 'Tablet Marketplace UI'

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js',
    -- Aquí podrías agregar imágenes si las tienes localmente
    -- 'html/assets/ak47.png',
}

client_scripts {
    'client/client.lua'
}

server_scripts {
    'server/server.lua'
}