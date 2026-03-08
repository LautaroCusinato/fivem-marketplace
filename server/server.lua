local ESX = exports["es_extended"]:getSharedObject()

-- Obtener datos cuando el jugador abre la tablet
ESX.RegisterServerCallback("marketplace:getData", function(source, cb)

    local xPlayer = ESX.GetPlayerFromId(source)

    MySQL.query("SELECT * FROM marketplace_ads", {}, function(result)

        local inventory = {}

        for k,v in pairs(xPlayer.inventory) do

            if v.count > 0 and Config.AllowedItems[v.name] then

                table.insert(inventory,{
                    name = v.name,
                    label = v.label,
                    count = v.count
                })

            end

        end

        cb({
            ads = result,
            inventory = inventory
        })

    end)

end)



-- PUBLICAR ITEM
RegisterServerEvent("marketplace:postAd")
AddEventHandler("marketplace:postAd", function(data)

    local src = source
    local xPlayer = ESX.GetPlayerFromId(src)

    local item = data.item
    local amount = tonumber(data.amount)
    local price = tonumber(data.price)

    if not item or not amount or not price then return end
    if amount <= 0 or price <= 0 then return end

    if not Config.AllowedItems[item] then
        print("Intento de publicar item no permitido")
        return
    end

    local invItem = xPlayer.getInventoryItem(item)

    if invItem.count < amount then
        TriggerClientEvent("esx:showNotification", src, "No tienes suficientes items")
        return
    end

    xPlayer.removeInventoryItem(item, amount)

    MySQL.insert(
    "INSERT INTO marketplace_ads (seller_identifier, seller_name, item, label, amount, price) VALUES (?, ?, ?, ?, ?, ?)",
    {
        xPlayer.identifier,
        xPlayer.getName(),
        item,
        invItem.label,
        amount,
        price
    })

    refreshMarket()

end)



-- COMPRAR ITEM
RegisterServerEvent("marketplace:buyAd")
AddEventHandler("marketplace:buyAd", function(adId)

    local src = source
    local buyer = ESX.GetPlayerFromId(src)

    MySQL.query("SELECT * FROM marketplace_ads WHERE id = ?", {adId}, function(result)

        if not result[1] then
            TriggerClientEvent("esx:showNotification", src, "El item ya no existe")
            return
        end

        local ad = result[1]

        if buyer.getMoney() < ad.price then
            TriggerClientEvent("esx:showNotification", src, "No tienes dinero suficiente")
            return
        end

        buyer.removeMoney(ad.price)

        buyer.addInventoryItem(ad.item, ad.amount)

        -- pagar al vendedor
        local seller = ESX.GetPlayerFromIdentifier(ad.seller_identifier)

        if seller then
            seller.addAccountMoney("bank", ad.price)
            TriggerClientEvent("esx:showNotification", seller.source, "Has vendido "..ad.label)
        end

        MySQL.update("DELETE FROM marketplace_ads WHERE id = ?", {adId})

        refreshMarket()

    end)

end)



-- REFRESCAR MARKET
function refreshMarket()

    MySQL.query("SELECT * FROM marketplace_ads", {}, function(result)

        TriggerClientEvent("marketplace:update", -1, result)

    end)

end