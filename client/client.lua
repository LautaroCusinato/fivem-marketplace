local isVisible = false

RegisterCommand("tablet", function()
    isVisible = not isVisible
    SetNuiFocus(isVisible, isVisible) -- Habilita ratón y teclado si es visible
    
    if isVisible then
        SendNUIMessage({ action = "open" })
    else
        SendNUIMessage({ action = "close" })
    end
end)

-- Callback que recibe el mensaje de cierre desde JS
RegisterNUICallback("closeTablet", function(data, cb)
    isVisible = false
    SetNuiFocus(false, false)
    cb('ok')
end)

RegisterCommand('marketplace', function()
    SetNuiFocus(true, true)
    SendNUIMessage({
        action = 'open',
        balance = GetPlayerMoney(), -- tu funcion de dinero
        items = Config.Items -- tus items del config
    })
end)

RegisterNUICallback('close', function(data, cb)
    SetNuiFocus(false, false)
    cb('ok')
end)

RegisterNUICallback('purchase', function(data, cb)
    TriggerServerEvent('marketplace:purchase', data.items, data.total)
    cb({ success = true })
end)
