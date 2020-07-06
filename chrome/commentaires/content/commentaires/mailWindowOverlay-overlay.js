ChromeUtils.import("resource://gre/modules/Services.jsm");

window.addEventListener("load", 
       function onload(event) {
        window.removeEventListener("load", this, false);
        document.getElementById("mailContext").addEventListener("popupshowing", affichePopup, false);
        document.getElementById("menu_EditPopup").addEventListener("popupshowing", afficheMenu, false);
       }, false);

       
function affichePopup(aEvent){
  
  if (gContextMenu){  
  
    let opt=document.getElementById("comment-optionmenuctx");
    if (gContextMenu.hideMailItems){
      opt.hidden=true;
      
    } else{
      
      let selectedMessages=gFolderDisplay.selectedMessages;
      if (1==selectedMessages.length){
        opt.hidden=false;
        opt.disabled=false;
      }
      else
        opt.hidden=true;
    }
  }
}

function afficheMenu(aEvent){
  
  let opt=document.getElementById("comment-optionmenu");
  
  if (gFolderDisplay){
    
    let currWin=Services.wm.getMostRecentWindow("");
    let currWinType=currWin.document.documentElement.getAttribute("windowtype");
    
    if (currWinType==="mail:messageWindow"){
      opt.disabled=false;
      return;
    }
    
    let tabs=document.getElementById("tabmail");
    if (tabs) {
      
      let selTab=tabs.selectedTab;
      if (selTab && (null==selTab.messageDisplay || !selTab.messageDisplay.visible)){
        opt.disabled=true;
        return;
      }
      
      if (1==GetNumSelectedMessages() && !gFolderDisplay.selectedMessageIsFeed){
        opt.disabled=false;
        return;
      }
      
      opt.disabled=true;
      
      return;
    }

  } else
    opt.disabled=true;
}
