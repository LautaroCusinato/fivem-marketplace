local fileName = "coords_tablet.json"

-- === GESTIÓN DEL NPC (JSON) ===

-- Guardar posición en JSON
RegisterNetEvent('perfecto_tablet:server:guardarNPC')
AddEventHandler('perfecto_tablet:server:guardarNPC', function(coords, heading)
    local data = { x = coords.x, y = coords.y, z = coords.z, h = heading }
    SaveResourceFile(GetCurrentResourceName(), fileName, json.encode(data, {indent = true}), -1)
    TriggerClientEvent('perfecto_tablet:client:actualizarNPC', -1, data)
    print("^3[TABLET]^7 Nueva ubicación guardada y sincronizada.")
end)

-- Callback para obtener coordenadas al iniciar el cliente
ESX.RegisterServerCallback('perfecto_tablet:server:getNPCCoords', function(source, cb)
    local file = LoadResourceFile(GetCurrentResourceName(), fileName)
    if file then
        cb(json.decode(file))
    else
        cb(nil)
    end
end)

-- === LÓGICA DE LA TABLET ===

-- Callback unificado para obtener todos los datos necesarios al abrir la tablet
ESX.RegisterServerCallback('perfecto_tablet:getServerData', function(source, cb)
    local xPlayer = ESX.GetPlayerFromId(source)
    if xPlayer then
        -- Obtenemos el inventario real para que aparezca en el menú de "Vender"
        local inventory = {}
        local playerInv = xPlayer.getInventory()

        for _, v in pairs(playerInv) do
            if v.count > 0 then
                table.insert(inventory, {
                    name = v.name,
                    label = v.label,
                    count = v.count
                })
            end
        end

        cb({
            money = xPlayer.getMoney(), -- Si usas ESX viejo usa: xPlayer.getAccount('money').money
            inventory = inventory,
            items = Config.Items
        })
    else
        cb(nil)
    end
end)

-- Evento de compra
RegisterNetEvent('marketplace:purchase')
AddEventHandler('marketplace:purchase', function(items, total)
    local _source = source
    local xPlayer = ESX.GetPlayerFromId(_source)
    
    if not xPlayer then return end

    if xPlayer.getMoney() >= total then
        xPlayer.removeMoney(total)
        
        -- 'items' debería ser una tabla con los productos comprados
        for _, itemData in pairs(items) do
            -- Asumimos que el objeto en el carrito tiene la propiedad 'name' o 'item'
            local itemName = itemData.item or itemData.name
            local itemCount = itemData.count or 1
            
            xPlayer.addInventoryItem(itemName, itemCount)
        end
        
        TriggerClientEvent('esx:showNotification', _source, "Has pagado $" .. total .. " por tu compra.")
    else
        TriggerClientEvent('esx:showNotification', _source, "~r~No tienes suficiente dinero en efectivo.")
    end
end)

-- Evento para publicar anuncio (Ejemplo básico para tu JS)
RegisterNetEvent('marketplace:server:postAd')
AddEventHandler('marketplace:server:postAd', function(data)
    local _source = source
    local xPlayer = ESX.GetPlayerFromId(_source)

    if xPlayer then
        -- Aquí podrías cobrar una comisión por publicar
        local commission = 100 
        if xPlayer.getMoney() >= commission then
            xPlayer.removeMoney(commission)
            TriggerClientEvent('esx:showNotification', _source, "Anuncio publicado por $" .. commission)
            -- Aquí podrías guardar el anuncio en una base de datos o tabla global
        else
            TriggerClientEvent('esx:showNotification', _source, "No tienes dinero para la comisión.")
        end
    end
end)