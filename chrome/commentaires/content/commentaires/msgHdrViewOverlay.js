ChromeUtils.import("resource:///modules/MailUtils.js");

window.addEventListener("messagepane-loaded", cm2CommentairesOnLoad, true);


//commentaire du message courant (valeur de l'entete) decode
var gMsgCommentaireOriginal="";

//nsIMsgDBHdr du message original
var gMsgHdrOriginal=null;
//nsIMsgDBHdr du message commente
var gMsgHdrComment=null;

var gDossierOriginal=null;


function cm2CommentairesOnLoad(){

  CommentairesTrace("cm2CommentairesOnLoad");
  
  removeEventListener("messagepane-loaded", cm2CommentairesOnLoad, true);
 
  gMessageListeners.push(gCommentHeadersListener);

  setupBoutonMore("expandedtoBox");
  
  setupBoutonMore("expandedccBox");
}



function setupBoutonMore(idelem) {

  let  expandedBox=document.getElementById(idelem);

  let  elems=document.getAnonymousNodes(expandedBox);
  if (elems) {
    for (var i=0;i<elems.length;i++){
      let  elem=elems[i];
      let  anonid=elem.getAttribute("anonid");
      if ("more"==anonid) {
        let  onclick=elem.getAttribute("onclick");
        elem.setAttribute("onclick", onclick+";clicBoutonMore();");
      }
    }
  }
}

function clicBoutonMore() {

  let exhdr=document.getElementById("expandedHeaderView");
  exhdr.scrollTop=0;
  let style=getComputedStyle(exhdr, null);
  let fs=style.getPropertyValue("font-size").slice(0,-2);
  exhdr.setAttribute("height", fs*14);

  document.getElementById("msgHeaderView-splitter").removeAttribute("collapsed");
}


//initialise le contenu de l'affichage des commentaires
function cm2CommentAffiche(texte) {

  let  ctrl=document.getElementById("comment-suivitxt");

  if (null==ctrl) 
    return;

  ctrl.value=texte;

  let  lib=document.getElementById("comment-lib");

  if (""!=texte)
    lib.setAttribute("class", "comment-libon");
  else
    lib.setAttribute("class", "comment-liboff");
}


let gCommentHeadersListener = {

  _cadreComment: null,

  get cadreComment() {
    if (null==this._cadreComment)
      this._cadreComment=new CadreControl();
    return this._cadreComment;
  },

  onStartHeaders: function() {

    document.getElementById("msgHeaderView-splitter").setAttribute("collapsed", true);
  },

  onEndHeaders: function() {

    CommentairesTrace("onEndHeaders");

    if (null!=currentHeaderData && 0!=currentHeaderData.length) {

      gMsgCommentaireOriginal="";

      if (null!=currentHeaderData[ENTETE_COMMENTAIRE_HDR])
        gMsgCommentaireOriginal=commentDecodeMimeStr(currentHeaderData[ENTETE_COMMENTAIRE_HDR].headerValue, null);

      cm2CommentAffiche(gMsgCommentaireOriginal);

      CommentairesTrace("onEndHeaders entete CM2_XSUIVIMEL gMsgCommentaireOriginal='"+gMsgCommentaireOriginal+"'");
    }

    document.getElementById("expandedHeaderView").removeAttribute("height");
    document.getElementById("singlemessage").removeAttribute("height");
    document.getElementById("imip-bar").removeAttribute("height");

    //controler affichage du cadre
    this.cadreComment.updateCadreComment();
  }
}



function btAjoutCommentaire(){

  CommentairesTrace("btAjoutCommentaire");

  gMsgHdrOriginal=gFolderDisplay.selectedMessage;
  gMsgHdrComment=null;

  if (null==gMsgHdrOriginal) {
    CommentairesAfficheMsgId("commentErrBtAjout");
    return;
  }
  CommentairesTrace("btAjoutCommentaire gMsgHdrOriginal.messageId:"+gMsgHdrOriginal.messageId);
  CommentairesTrace("btAjoutCommentaire gMsgHdrOriginal.messageKey:"+gMsgHdrOriginal.messageKey);
  
  gDossierOriginal=gMsgHdrOriginal.folder;
  
  //tester droit d'ecriture =>
  if (!gDossierOriginal.canDeleteMessages ||
      !gDossierOriginal.canFileMessages) {
    CommentairesTrace("btAjoutCommentaire boite en lecture seule");
    CommentairesAfficheMsgId("commentReadOnly");
    return;
  }

  let  hdrDisplayed=gMessageDisplay.displayedMessage;
  if (null==hdrDisplayed || hdrDisplayed.messageKey!=gMsgHdrOriginal.messageKey){
        
    CommentairesTrace("btAjoutCommentaire extraction commentaire original necessaire");
    try{
    
      gMsgCommentaireOriginal=ExtraitCommentaire(gMsgHdrOriginal);
      
    } catch(ex){
      CommentairesTrace("btAjoutCommentaire exception extraction commentaire:"+ex);
      CommentairesAfficheMsgId("commentErrBtAjout");
      return;
    }
  }

  CommentairesTrace("btAjoutCommentaire gMsgCommentaireOriginal:"+gMsgCommentaireOriginal);

  let args=new Object();
  args.msghdr=gMsgHdrOriginal;
  args.comment=gMsgCommentaireOriginal;
  args.msgerr="";

  //boite d'edition
  window.openDialog("chrome://commentaires/content/commentairesdlg.xul","","dialog,modal,center,titlebar,resizable",args);
        
  // mNewKey
  if (null!=args.res && 0==args.res && null!=args.mNewKey) {
    
    //succes
    CommentairesTrace("btAjoutCommentaire succes modification/copie du message args.mNewKey:"+args.mNewKey);
    
    SelectionNouveauMsg(args.mNewKey);
        
  } else{
    
    // echec/erreur
    gMsgHdrOriginal=null;
    gMsgHdrComment=null;
    
    if (null==args.msgerr || ""==args.msgerr) {
      CommentairesTrace("btAjoutCommentaire annulation");
      //annulation
      return;
    }

    CommentairesAfficheMsgId2("commentErrExcept", args.msgerr);
  }
}


function ChangeAffComment() {

  CommentairesTrace("ChangeAffComment");

  let  b=document.getElementById("comment-suivi");
  let  img=document.getElementById("comment-toggleSuivi");
  let  cadre=document.getElementById("comment-cadre");
  let  split=document.getElementById("comment-split");

  let  etat=b.getAttribute("collapsed");
  CommentairesTrace("ChangeAffComment etat="+(etat?"true":"false"));

  if (etat){

    b.collapsed=false;
    img.setAttribute("class", "commentopen");
    split.removeAttribute("collapsed");

  } else{

    b.collapsed=true;
    img.setAttribute("class", "commentcollapsed");
    split.setAttribute("collapsed", true);

    cadre.removeAttribute("height");
  }
}


// afficher message modifié
function SelectionNouveauMsg(msgkey){

  CommentairesTrace("SelectionNouveauMsg afficher message modifié msgkey:"+msgkey);
  
  let newmsghdr=gDossierOriginal.GetMessageHeader(msgkey);  
  gFolderDisplay.selectMessage(newmsghdr);
}
