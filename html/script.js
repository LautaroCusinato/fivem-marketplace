const tablet = document.getElementById("tablet")

window.addEventListener("message", function(event){

    if(event.data.action === "open"){
        tablet.style.display = "block"
    }

    if(event.data.action === "close"){
        tablet.style.display = "none"
    }

})

document.getElementById("close").onclick = function(){

    tablet.style.display = "none"

    fetch(`https://${GetParentResourceName()}/closeTablet`,{
        method:"POST"
    })

}