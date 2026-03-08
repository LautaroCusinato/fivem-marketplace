local tabletOpen = false

RegisterCommand("tablet", function()
    tabletOpen = not tabletOpen

    SetNuiFocus(tabletOpen, tabletOpen)

    SendNUIMessage({
        action = tabletOpen and "open" or "close"
    })
end, false)

RegisterNUICallback("closeTablet", function(data, cb)
    tabletOpen = false
    SetNuiFocus(false, false)
    cb("ok")
end)

-- cerrar con ESC
CreateThread(function()
    while true do
        Wait(0)

        if tabletOpen and IsControlJustReleased(0, 322) then
            tabletOpen = false
            SetNuiFocus(false,false)

            SendNUIMessage({
                action = "close"
            })
        end
    end
end)