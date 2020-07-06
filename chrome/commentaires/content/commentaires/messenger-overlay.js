
window.addEventListener("load", initCommentairesMessenger, false);


/*
*  appelée au démarrage de Thunderbird
*
*/
function initCommentairesMessenger(){

  CommentairesTrace("initCommentairesMessenger");
  
  window.addEventListener("unload", quitteCommentairesMessenger, false);

  FolderDisplayListenerManager.registerListener(CommentFolderListener);
}

let CommentFolderListener={

  _cadreComment: null,

  get cadreComment() {
    if (null==this._CadreComment)
      this._CadreComment=new CadreControl();
    return this._CadreComment;
  },

  updateCadreComment: function(){
    let  _this=this;
    window.setTimeout(function(){_this.cadreComment.updateCadreComment()}, 0);
  },

  onLoadingFolder: function(aDbFolderInfo) {},

  onDisplayingFolder: function() {},

  onLeavingFolder: function() {
    this.updateCadreComment();
  },

  onMessagesLoaded: function(aAll) {},

  onMailViewChanged: function() {},

  onActiveMessagesLoaded: function() {
    this.updateCadreComment();
  },

  onMessageCountsChanged: function() {
    this.updateCadreComment();
  }
}



function quitteCommentairesMessenger(){

  CommentairesTrace("quitteCommentairesMessenger");
  FolderDisplayListenerManager.unregisterListener(CommentFolderListener);
}

function OnCommentEdit(event) {

  CommentairesTrace("OnCommentEdit");

  let selectedCount=gFolderDisplay.selectedCount;

  let  menu=document.getElementById("comment-optionmenu");

  if (0==selectedCount)
    menu.setAttribute("disabled", true);
  else 
    menu.removeAttribute("disabled");
}
