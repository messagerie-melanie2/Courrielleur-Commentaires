
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource:///modules/mailServices.js");

const Cc=Components.classes;
const Ci=Components.interfaces;


//commentaire original decode (pour reprise et controle longueur totale des commentaires)
var gCommentaireOriginal="";
//sujet original decode
var gSujetOriginal="";
//textbox id="comment-suivi"
let gSaisieCommentaire=null;
//memorisation commentaire saisi pour limitation longueur
var gCommentaire="";


/*
*  initialisation de la boîte de saisie
*
*/
function initDlgCommentaires(){

  //argument d'appel
  if (null==window.arguments ||
      null==window.arguments[0] ||
      null==window.arguments[0].msghdr){
    CommentairesAfficheMsgId("commentErrAppel");
    window.close();
  }
  
  let msghdr=window.arguments[0].msghdr;
  CommentairesTrace("initDlgCommentaires msghdr:"+msghdr);

  gCommentaireOriginal=window.arguments[0].comment;
  CommentairesTrace("initDlgCommentaires commentaire original:"+gCommentaireOriginal);

  gSujetOriginal=msghdr.mime2DecodedSubject;
  CommentairesTrace("initDlgCommentaires sujet original:"+gSujetOriginal);

  document.getElementById("comment-sujet").value=gSujetOriginal;

  gSaisieCommentaire=document.getElementById("comment-suivi");

  gSaisieCommentaire.focus();

  gCommentaires.Init(msghdr, gCommentaireOriginal);

  // liste des comptes
  initListeComptes(msghdr.folder);
}

function ValideSaisie(){

  //tester modications
  let sujet=CommentGetSujet();

  if (sujet==gSujetOriginal && ""==gCommentaire){
    CommentairesAfficheMsgId("commentPas2Modif");
    return;
  }

  if (sujet==gSujetOriginal) {
    sujet=null;//->pas de modification
  }

  CommentairesTrace("ValideSaisie sujet:"+sujet);
  CommentairesTrace("ValideSaisie commentaire:"+gCommentaire);

  window.setCursor("wait");

  gCommentaires.CommenteMsg(sujet, gCommentaire);
}

function AnnuleSaisie() {

  window.arguments[0].res=-1;
  window.arguments[0].msgerr="";
  window.arguments[0].mNewKey=null;

  window.close();
}

function FermeDlgComment() {

  window.setCursor("auto");
  
  window.close();
}


//fonction de rappel en fin d'operation de commentaire de message
//la fonction peut être appelée en cours d'opération si une erreur est detectee
function RetourCommentMsg(){

  window.setCursor("auto");

  gSaisieCommentaire=null;
  
  gCommentaires.mEtat=ETAT_0;

  let code=gCommentaires.mResultCode;

  CommentairesTrace("RetourCommentMsg code:"+code);

  if (0!=code){

    let msg;

    if (-1!=code){

      msg=CommentairesMessageFromId("commentErrCopie");
      msg=msg.replace("%N", code);

    }  else {

      if (null==gCommentaires.mErrMsg || ""==gCommentaires.mErrMsg)
        msg=CommentairesMessageFromId("commentErrComment");
      else
        msg=gCommentaires.mErrMsg;
    }

    Services.prompt.alert(window, CommentairesMessageFromId("commentPromptTitle"), msg);
  }

  window.arguments[0].res=code
  window.arguments[0].msgerr=gCommentaires.mErrMsg;
  window.arguments[0].mNewKey=gCommentaires.mNewKey;

  FermeDlgComment();
}


//retourne le sujet de la boîte (idem original ou modifie)
function CommentGetSujet(){

  return document.getElementById("comment-sujet").value;
}



/*
*  Evénement oninput de la zone de saisie de commentaire
*/
function OnSaisieComment(){

  if (LIMITECOMMENTAIRE < gSaisieCommentaire.textLength+gCommentaireOriginal.length){

    let msg=CommentairesMessageFromId("commentLimCar");
    msg=msg.replace("%S", LIMITECOMMENTAIRE);

    Services.prompt.alert(window, CommentairesMessageFromId("commentPromptTitle"), msg);

    gSaisieCommentaire.value=gCommentaire;

  } else
    gCommentaire=gSaisieCommentaire.value;
}



/* instance Commentaires pour la modification des messages */

//nom du fichier temporaire
const COMMENTAIRES_FICHIER="commentaires-tmp";

//longueur de lecture (suffisamment long pour lire toutes les entetes en une seule fois)
const MSG_READ_LENGTH=8000;
//const MSG_READ_LENGTH=400;//tests

//saut de ligne pour le message commenté
const SAUT_LIGNE="\r\n";

// etats
const ETAT_0=0;
// création fichier message commenté
const ETAT_TMP=1;
// copie fichier message commenté dans le dossier d'origine
const ETAT_CP=2;
// suppression du message original
const ETAT_DEL=4;
// selection du message commenté
const ETAT_SEL=8;


var gCommentaires = {

  //valeurs du message original
  mOriginalmsghdr : null,
  mOriginalSujet : null,
  mOriginalComment: null,
  
  mDossierMessage:null,
  
  mOriginalSep: null,
  
  get originalSep(){
    return this.mOriginalSep;
  },
  
  set originalSep(sep){
    this.mOriginalSep=sep;
  },

  //nouvelles valeurs si non null
  mNewComment : null,
  mNewSujet : null,

  // key message commenté (positionné par SetMessageKey)
  mNewKey: null,

  //chemin du fichier temporaire
  mCheminFichierTemp: null,

  //ecriture flux
  mFluxSortie: null,

  //code resultat -1 si erreur interne, 0 si success, autre -> erreur tb
  mResultCode : 0,
  //message d'erreur interne
  mErrMsg: null,

  //charset message
  mCharset: null,

  //si true : a l'interieur des entetes (initialise dans CommenteMsg)
  mInHeader: false,
  //true si commentaire traite (initialise dans CommenteMsg)
  mbComment: false,
  //true si sujet traité (initialise dans CommenteMsg)
  mbSujet: false,
  //si true ligne entete a ignorer
  mIgnoreHeader: false,
  //portion de ligne coupee lors de la lecture
  mLigneCoupee: null,
 
  
  msgWindow: null,
  
  mEtat: ETAT_0,


  /* methodes */
  Init: function(msghdr, comment) {

    this.mOriginalmsghdr=msghdr;
    this.mDossierMessage=this.mOriginalmsghdr.folder;
    this.mOriginalSujet=msghdr.mime2DecodedSubject;
    this.mOriginalComment=comment;
  },

  get inHeader(){
    return this.mInHeader;
  },
  set inHeader(bHeader){
    this.mInHeader=bHeader;
  },

  //ajoute et/ou modifie le sujet et/ou le commentaire du message
  CommenteMsg: function(sujet, commentaire) {

    if (null==this.mOriginalmsghdr) 
      throw("Erreur d'initialisation du messsage original.");

    this.mNewSujet=sujet;
    this.mNewComment=commentaire;

    this.mResultCode=0;
    this.mErrMsg=null;

    this.inHeader=true;
    //true si commentaire traite
    this.mbComment=(null==this.mNewComment||""==this.mNewComment) ? true : false;
    //true si sujet traité
    this.mbSujet=(null==this.mNewSujet) ? true : false;
    //
    this.mIgnoreHeader=false;
    //portion de ligne coupee lors de la lecture
    this.mLigneCoupee=null;

    this.CreeFichierTemp();

    //pour modification du message original
    this.CreeFichierCommentaire();
  },

  //creation du fichier temporaire
  //initialise egalement mCheminFichierTemp
  //retourne instance nsIFile
  CreeFichierTemp: function() {

    this.mCheminFichierTemp=null;

    let profdir=Services.dirsvc.get("TmpD", Ci.nsIFile);

    let fichier=Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);

    fichier.initWithPath(profdir.path);
    fichier.appendRelativePath(COMMENTAIRES_FICHIER);

    try {
      
      fichier.createUnique(fichier.NORMAL_FILE_TYPE, 0666);
      CommentairesTrace("CreeFichierTemp creation du fichier:"+fichier.path);
      
    } catch(ex){
      CommentairesTrace("CreeFichierTemp exception");
      return null;
    }

    this.mCheminFichierTemp=fichier.path;

    return fichier;
  },

  //retourne instance nsIFile du fichier temporaire
  //CreeFichierTemp doit etre appelee avant
  GetFichierTemp: function() {

    if (null==this.mCheminFichierTemp)
      return null;

    let fichier=Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);

    fichier.initWithPath(this.mCheminFichierTemp);

    return fichier;
  },

  //Supprime le fichier temporaire sur disque
  DelFichierTemp: function() {

    let fichier=this.GetFichierTemp();

    if (!fichier.exists()){
      CommentairesTrace("DelFichierTemp le fichier n'existe pas:"+fichier.path);
      return;
    }

    CommentairesTrace("Suppression du fichier:"+fichier.path);
    fichier.remove(false);
  },

  get fluxSortie() {

    if (null==this.mFluxSortie) {
      let fichier=this.GetFichierTemp();
      this.mFluxSortie=Cc["@mozilla.org/network/file-output-stream;1"]
                          .createInstance(Ci.nsIFileOutputStream);
      this.mFluxSortie.init(fichier, 0x02|0x08|0x20, 0666, 0);
    }

    return this.mFluxSortie;
  },

  //determiner charset
  get charset(){

    if (null==this.mCharset) {
      let msgCompFields=Cc["@mozilla.org/messengercompose/composefields;1"]
                                .createInstance(Ci.nsIMsgCompFields);
      this.mCharset=msgCompFields.characterSet;
      CommentairesTrace("get charset :"+this.mCharset);
    }
    
    return this.mCharset;
  },

  //copie du message original pour modifications (asynchrone) -> mFichierTmp
  CreeFichierCommentaire: function() {

    let msguri=this.mOriginalmsghdr.folder.getUriForMsg(this.mOriginalmsghdr);
    
    this.msgWindow=Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(Ci.nsIMsgWindow);

    let messenger=Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
    let msgService=messenger.messageServiceFromURI(msguri);

    CommentairesTrace("CreeFichierCommentaire copie du message original pour modifications");
    
    let newUri=new Object();
    
    this.mEtat=ETAT_TMP;

    msgService.CopyMessage(msguri, this, false, this, this.msgWindow, newUri);
    
    newUri=null;
  },

  //fonction appelee en fin de copie du message original (CreeFichierCommentaire)
  CopieFichierCommentaire: function() {

    CommentairesTrace("CopieFichierCommentaire");

    //copie du message modifie dans le dossier
    let msgCopyService=Cc["@mozilla.org/messenger/messagecopyservice;1"]
                      .getService(Ci.nsIMsgCopyService);

    let fichier=this.GetFichierTemp();

    //si pas de commentaire on n'ajoute pas le tag
    let bComment=false;
    if (null!=this.mNewComment && ""!=this.mNewComment)
      bComment=true;
    if (null!=this.mOriginalComment && ""!=this.mOriginalComment)
      bComment=true;

    let keywords=this.mOriginalmsghdr.getStringProperty("keywords");
    CommentairesTrace("CopieFichierCommentaire etiquettes originales:"+keywords);

    if (bComment) {
      
      let raz=Services.prefs.getBoolPref("commentaires.razetiqettes");
      if (raz){     
        keywords=TAG_COMMENTAIRE_CLE;
        
      } else if (-1==keywords.indexOf(TAG_COMMENTAIRE_CLE)) {
        if (""!=keywords) 
          keywords+=" ";
        keywords+=TAG_COMMENTAIRE_CLE;
      }    
    }
    CommentairesTrace("CopieFichierCommentaire etiquettes positionnees:"+keywords);

    CommentairesTrace("CopieFichierCommentaire copie du fichier message dans le dossier d'origine");
    
    this.mEtat=ETAT_CP;
    
    msgCopyService.CopyFileMessage( fichier,
                                    this.mOriginalmsghdr.folder,
                                    null, 
                                    false,
                                    Ci.nsMsgMessageFlags.Read,
                                    keywords,
                                    this, 
                                    null);

  },

  FormateCommentaires: function(newcomment, oldcomment){

    if (null==newcomment || ""==newcomment){
      CommentairesTrace("FormateCommentaires return oldcomment");
      return oldcomment;
    }

    let jour=DateHeureDuJour();

    let util=document.getElementById("comment-util").label;

    let prefix=CommentairesMessageFromId("commentPrefix");
    prefix=prefix.replace("%J", jour);
    prefix=prefix.replace("%U", util);

    let comment=prefix+SAUT_LIGNE+newcomment;

    if (null==oldcomment || ""==oldcomment){
      CommentairesTrace("FormateCommentaires return comment=newcomment");
      return comment;
    }

    let anmsgcomposeen=commentDecodeMimeStr(oldcomment, this.charset);

    return comment+SAUT_LIGNE+anmsgcomposeen;
  },
  
  // suppression du message original
  SupprimeMsgOriginal: function(){
    
    CommentairesTrace("SupprimeMsgOriginal");
    
    let msgs=Components.classes["@mozilla.org/array;1"].createInstance(Components.interfaces.nsIMutableArray);
    msgs.appendElement(this.mOriginalmsghdr, false);
    
    this.mOriginalmsghdr=null;
    
    this.mEtat=ETAT_DEL;
    
    this.mDossierMessage.deleteMessages(msgs, this.msgWindow, true, false, this, false);
  },
  
  // affichage du message commenté
  AfficheMsgComment: function(){
    
    CommentairesTrace("AfficheMsgComment this.mNewKey:"+this.mNewKey);
    
    this.mEtat=ETAT_SEL;
    
    let newmsghdr=this.mDossierMessage.GetMessageHeader(this.mNewKey);
    
    window.opener.gFolderDisplay.selectMessage(newmsghdr);
  },

  // ajout étiquette commenté et/ou supprimer les autres (mantis 4940)
  // pour mode pop/local (pas d'effet en imap)
  majEtiquettes: function(){

    // mantis 4940
    let newmsghdr=this.mDossierMessage.GetMessageHeader(this.mNewKey);
    let bComment=false;
    if (null!=this.mNewComment && ""!=this.mNewComment)
      bComment=true;
    if (null!=this.mOriginalComment && ""!=this.mOriginalComment)
      bComment=true;

    if (bComment) {
      let raz=Services.prefs.getBoolPref("commentaires.razetiqettes");
      if (raz){
        CommentairesTrace("AfficheMsgComment razetiqettes true");
        newmsghdr.setStringProperty("keywords", TAG_COMMENTAIRE_CLE);
      }
    }
  },  

  //nsIStreamListener - creation du fichier message modifie
  onStartRequest: function(aRequest, aContext) {
    CommentairesTrace("onStartRequest");
  },

  onStopRequest: function(aRequest, aContext, aStatusCode) {
    CommentairesTrace("onStopRequest aStatusCode:"+aStatusCode);
    
    this.fluxSortie.close();
    
    this.mDossierMessage.copyDataDone();
        
    if (0!=aStatusCode){
      CommentairesTrace("onStopRequest erreur!");
      this.mResultCode=aStatusCode;
      RetourCommentMsg();
      return;
    }
    
    this.CopieFichierCommentaire();
  },

  onDataAvailable: function(aRequest, aContext, aInputStream, aOffset, aCount) {

    //flux de lecture
    let scriptableInputStream=Cc["@mozilla.org/scriptableinputstream;1"]
                              .createInstance(Ci.nsIScriptableInputStream);
    scriptableInputStream.init(aInputStream);

    CommentairesTrace("onDataAvailable lecture flux entree");
    while (true) {

      //lecture du flux d'entree
      let avail=0;
      try{
        avail=scriptableInputStream.available();
      } catch(ex){
        CommentairesTrace("onDataAvailable onDataAvailable body available exception->flux ferme");
        break;
      }
      if (0==avail){
        CommentairesTrace("onDataAvailable onDataAvailable 0==avail");
        break;
      }

      let lread=Math.min(avail, MSG_READ_LENGTH);
      let buffer=scriptableInputStream.read(lread);
      let nb=buffer.length;
      if (0==nb){
        CommentairesTrace("onDataAvailable onDataAvailable 0==buffer.length !");
        break;
      }

      //detection saut message original
      if (null==this.originalSep){
        let pos=buffer.indexOf("\r\n");
        if (-1!=pos){
          CommentairesTrace("onDataAvailable onDataAvailable sep CRLF");
          this.originalSep="\r\n";
        } else{
          CommentairesTrace("onDataAvailable onDataAvailable sep LF");
          this.originalSep="\n";
        }
      }
      let sep=this.originalSep;
      let delta=sep.length;

      //traitement des lignes
      let debut=0, pos=0;
      let str="";
      pos=buffer.indexOf(sep, debut);

      while (-1!=pos){
        if (0==debut &&
            null!=this.mLigneCoupee) {
          str=this.mLigneCoupee+buffer.substr(debut, pos-debut);
          this.mLigneCoupee=null;
        } else{
          str=buffer.substr(debut, pos-debut);
        }
        this.traiteLigne(str);

        debut=pos+delta;
        //suivant
        pos=buffer.indexOf(sep, debut);
      }

      //ligne coupee restante?  => memoriser
      if (debut < nb)
        this.mLigneCoupee=buffer.substr(debut);
    }

    CommentairesTrace("onDataAvailable fin");
  },

  traiteLigne: function(ligne) {

    let fileOutputStream=this.fluxSortie;

    //traitement body
    if (!this.inHeader){
      fileOutputStream.write(ligne, ligne.length);
      fileOutputStream.write(SAUT_LIGNE, SAUT_LIGNE.length);
      return;
    }

    //traitement header

    //detection ligne vide => fin d'entetes?
    if (""==ligne) {

      CommentairesTrace("traiteLigne entete ligne vide");

      //sujet a inserer?
      if (!this.mbSujet) {
        CommentairesTrace("traiteLigne entete sujet a inserer");
        //ecrire nouveau sujet
        let enc_sujet=ENTETE_SUJET;
        enc_sujet+=commentEncodeMimeStr(this.mNewSujet, this.charset);
        CommentairesTrace("traiteLigne ecriture nouveau sujet:"+enc_sujet);
        fileOutputStream.write(enc_sujet, enc_sujet.length);
        fileOutputStream.write(SAUT_LIGNE, SAUT_LIGNE.length);
        this.mbSujet=true;
      }

      //commentaire a inserer?
      if (!this.mbComment) {
        let comments=this.FormateCommentaires(this.mNewComment, null);
        CommentairesTrace("traiteLigne commentaire a inserer:"+comments);
        fileOutputStream.write(ENTETE_COMMENTAIRE, ENTETE_COMMENTAIRE.length);
        comments=commentEncodeMimeStr(comments, this.charset);
        fileOutputStream.write(comments, comments.length);
        fileOutputStream.write(SAUT_LIGNE, SAUT_LIGNE.length);
        this.mbComment=true;
      }

      //terminer entetes
      CommentairesTrace("traiteLigne fin entetes");
      this.inHeader=false;
      fileOutputStream.write(SAUT_LIGNE, SAUT_LIGNE.length);

      return;
    }

    //ignorer lignes suivantes de l'entete?
    if (this.mIgnoreHeader) {
      
      if (9==ligne.charCodeAt(0) || 32==ligne.charCodeAt(0)) {
        CommentairesTrace("traiteLigne ligne ignoree:'"+ligne+"'");
        return;
      }

      this.mIgnoreHeader=false;
      //ecriture
      fileOutputStream.write(ligne, ligne.length);
      fileOutputStream.write(SAUT_LIGNE, SAUT_LIGNE.length);

      return;
    }

    //detection sujet original
    if (!this.mbSujet &&
        0==ligne.toLowerCase().indexOf(ENTETE_SUJET.toLowerCase())){

      CommentairesTrace("traiteLigne entete sujet original");
      //ecrire nouveau sujet
      let enc_sujet=ENTETE_SUJET;
      enc_sujet+=commentEncodeMimeStr(this.mNewSujet, this.charset);
      CommentairesTrace("traiteLigne ecriture nouveau sujet:"+enc_sujet);
      fileOutputStream.write(enc_sujet, enc_sujet.length);
      fileOutputStream.write(SAUT_LIGNE, SAUT_LIGNE.length);

      //ignorer lignes suivantes du sujet original
      CommentairesTrace("traiteLigne ignorer lignes suivantes");
      this.mIgnoreHeader=true;

      this.mbSujet=true;
      return;
    }

    //detection commentaire original
    if (!this.mbComment &&
        0==ligne.indexOf(ENTETE_COMMENTAIRE)){

      CommentairesTrace("traiteLigne entete commentaire original");

      //ajouter nouveau commentaire a l'original
      let comments=this.FormateCommentaires(this.mNewComment, this.mOriginalComment);
      CommentairesTrace("traiteLigne nouveau commentaire a inserer:"+comments);

      //ecrire nouveau(x) commentaire(s)
      fileOutputStream.write(ENTETE_COMMENTAIRE, ENTETE_COMMENTAIRE.length);
      comments=commentEncodeMimeStr(comments, this.charset);
      fileOutputStream.write(comments, comments.length);
      fileOutputStream.write(SAUT_LIGNE, SAUT_LIGNE.length);

      //ignorer lignes suivantes du commentaire original
      this.mIgnoreHeader=true;

      this.mbComment=true;
      return;
    }

    //ecriture standard
    fileOutputStream.write(ligne, ligne.length);
    fileOutputStream.write(SAUT_LIGNE, SAUT_LIGNE.length);
  },


  //nsIMsgCopyServiceListener - copie du fichier message modifie dans le dossier original
  OnStartCopy: function() { },
  OnProgress: function(aProgress, aProgressMax) { },
  SetMessageKey: function(aKey) {
    CommentairesTrace("msgCopyServiceListener SetMessageKey aKey="+aKey);
    this.mNewKey=aKey;
  },
  GetMessageId: function(aMessageId) { },
  OnStopCopy: function(aStatus) {
    
    CommentairesTrace("msgCopyServiceListener OnStopCopy aStatus:"+aStatus);
   
    if (0!=aStatus){
      CommentairesTrace("msgCopyServiceListener OnStopCopy erreur!");
      
      this.mResultCode=aStatus;
      RetourCommentMsg();
      return;
    }

    if (this.mOriginalmsghdr &&
        0!=this.mDossierMessage.URI.indexOf("imap://")){
      this.SupprimeMsgOriginal();

      this.majEtiquettes();
    }
  },
  
  // 
  OnStartRunningUrl: function(url){},

  OnStopRunningUrl: function(url, aExitCode){
    
    CommentairesTrace("OnStopRunningUrl url:"+url.spec+" - aExitCode:"+aExitCode);
    
    if (this.mOriginalmsghdr &&
        0==this.mDossierMessage.URI.indexOf("imap://")){

      this.SupprimeMsgOriginal();
      
    } else if (ETAT_DEL==this.mEtat){
      
      // selectionner le nouveau (si nécessaire)
      this.AfficheMsgComment();
      
      if (0!=this.mDossierMessage.URI.indexOf("imap://")){
        
        this.DelFichierTemp();
      
        RetourCommentMsg();
      }
          
    } else if (ETAT_SEL==this.mEtat){
      
      this.DelFichierTemp();
      
      RetourCommentMsg();
    }         
  }
}

// construction de la liste des comptes
function initListeComptes(dossier){

  let popup=document.getElementById("comment-popup");

  let allServeurs=MailServices.accounts.allServers;

  let nbServers=allServeurs.length;
  for (var i=0; i<nbServers; i++){

    let server=allServeurs.queryElementAt(i, Components.interfaces.nsIMsgIncomingServer);

    let confid=server.getCharValue("pacome.confid");
    if (null==confid || "flux"==confid)
      continue;

    let elem=document.createElement("menuitem");
    elem.setAttribute("label", server.prettyName);
    elem.setAttribute("crop", "end");
    elem.setAttribute("value", server.key);

    popup.appendChild(elem);

    if (dossier.server.key==server.key)
      document.getElementById("comment-util").selectedItem=elem;
  }
}
