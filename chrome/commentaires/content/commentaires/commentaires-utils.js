
ChromeUtils.import("resource://gre/modules/Services.jsm");

/* constantes tag commentaire */
const TAG_COMMENTAIRE_CLE="~commente";
const TAG_COMMENTAIRE_LIB="Comment\u00e9";
const TAG_COMMENTAIRE_COLOR="#666666";

/* entetes */
const ENTETE_SUJET="Subject: ";
const ENTETE_COMMENTAIRE="X-Suivimel: ";
const ENTETE_COMMENTAIRE_HDR="x-suivimel";

//longueur maxi d'un commentaire saisi
const LIMITECOMMENTAIRE=4000;
//const LIMITECOMMENTAIRE=200;


/*
*  Génération de traces
*/
var gCommentTrace=false;
var gCommentConsole=null;

function CommentairesTrace(msg){
  
  if (!gCommentTrace){
    let t=Services.prefs.getBoolPref("commentaires.trace");
    if (t)
      gCommentConsole=Services.console;
    gCommentTrace=true;
  }
  
  if (gCommentConsole) 
    gCommentConsole.logStringMessage("Commentaires "+msg);
}


//liste des chaines commentaires.properties
let gCommentBundle=null;

/*
*  Retourne une chaîne de message à partir de son identifiant dans le fichie commentaires.properties
*/
function CommentairesMessageFromId(msgid){
  
  if (null==gCommentBundle)
    gCommentBundle=Services.strings.createBundle("chrome://commentaires/locale/commentaires.properties");
    
  return gCommentBundle.GetStringFromName(msgid);
}


/*
*  Affichage d'un message à partir de l'identifiant dans commentaires.properties
*
*  @param msgid identifiant du message
*/
function CommentairesAfficheMsgId(msgid){
  
  let msg=CommentairesMessageFromId(msgid);
  
  Services.prompt.alert(window, CommentairesMessageFromId("commentPromptTitle"), msg);
}

/*
*  Affichage d'un message à partir de l'identifiant dans commentaires.properties
*
*  @param msgid identifiant du message
*  @param msg2 message additionnel affiché sur nouvelle ligne (optionnel)
*/
function CommentairesAfficheMsgId2(msgid,msg2){
  
  let msg=CommentairesMessageFromId(msgid);
  if (null!=msg2) 
    msg+="\n"+msg2;
  
  Services.prompt.alert(window, CommentairesMessageFromId("commentPromptTitle"), msg);
}


/* utilitaires d'encodage/decode mime */
//decodage uniquement pour v2 (v3 decodage automatique)
function commentDecodeMimeStr(str, charset) {

  CommentairesTrace("commentDecodeMimeStr str:"+str);

  //détection commentaire v2/v3
  if (0==str.indexOf("Le%20")){

    if (null!=str && ""!=str){
      
      let tmp=str.replace(/\x09/g,"");
      tmp=tmp.replace(/[\x0D\x0A]/g,"");
      tmp=decodeURIComponent(tmp);
      str=tmp.replace(/\x09/g,"\n");
      
    } else
      str="";
    
    CommentairesTrace("commentDecodeMimeStr decodage v2:"+str);
    return str;
  }

  return str.replace(/\xA4\xA4/g, "\r\n");
}

function commentEncodeMimeStr(str, charset) {

  if (null==str || 0==str.length)
    return str;

  CommentairesTrace("commentEncodeMimeStr str:"+str);

  str=str.replace(/\r\n|\n\r|\r|\n/g, "\xA4\xA4");

  let mimeEncoder=Components.classes["@mozilla.org/messenger/mimeconverter;1"]
                  .getService(Components.interfaces.nsIMimeConverter);

  return mimeEncoder.encodeMimePartIIStr_UTF8(str, false, "UTF-8", 0, 72);
}


/*
*  retourne la date courante
*
*  @return la date sous la forme JJ/MM/AAAA
*/
function DateDuJour(){

  let courante=new Date();
  let jour=courante.getDate();
  if (jour<10) 
    jour="0"+jour;
  let mois=courante.getMonth()+1;
  if (mois<10) 
    mois="0"+mois;
  
  return jour+"/"+mois+"/"+courante.getFullYear();
}

/*
*  retourne la date courante
*
*  @return la date sous la forme JJ/MM/AAAA HH:MN
*/
function DateHeureDuJour(){

  let courante=new Date();
  let jour=courante.getDate();
  if (jour<10) 
    jour="0"+jour;
  let mois=courante.getMonth()+1;
  if (mois<10) 
    mois="0"+mois;
  let heure=courante.getHours();
  if (heure<10) 
    heure="0"+heure;
  let mn=courante.getMinutes();
  if (mn<10) 
    mn="0"+mn;
  
  return jour+"/"+mois+"/"+courante.getFullYear()+" "+heure+":"+mn;
}



/* controle de l'affichage du cadre (on/off) */
function CadreControl() {

}

CadreControl.prototype = {

  _cadreComment: null,

  get cadreComment() {
    if (null==this._CadreComment)
      this._CadreComment=document.getElementById("comment-cadre");
    return this._CadreComment;
  },

  _splitterComment: null,

  get splitterComment() {
    if (null==this._splitterComment)
      this._splitterComment=document.getElementById("comment-split");
    return this._splitterComment;
  },

  _menuComment: null,

  get menuComment() {
    if (null==this._menuComment)
      this._menuComment=document.getElementById("comment-optionmenu");
    return this._menuComment;
  },

  _ctxComment: null,

  get ctxComment() {
    if (null==this._ctxComment)
      this._ctxComment=document.getElementById("comment-optionmenuctx");
    return this._ctxComment;
  },


  updateCadreComment: function() {

    let selectedCount=gFolderDisplay.selectedCount;

    CommentairesTrace("CadreControl updateCadreComment selectedCount="+selectedCount);

    if (0==selectedCount) {

      CommentairesTrace("CadreControl updateCadreComment this.cadreComment.collapsed=true");
      this.cadreComment.collapsed=true;
      this.splitterComment.collapsed=true;

    } else
      this.cadreComment.collapsed=false;

    if (1==selectedCount) {
      this.menuComment.removeAttribute("disabled");
      this.ctxComment.removeAttribute("disabled");
      
    } else {
      this.menuComment.setAttribute("disabled", true);
      this.ctxComment.setAttribute("disabled", true);
    }
  }
}

// extraction du commentaire d'un message
function ExtraitCommentaire(msghdr){
  
  let comment="";
  
  let alire=Math.min(msghdr.messageSize, 100000);
  let dossier=msghdr.folder;
  let reusable=new Object();
  
  let stream=dossier.getMsgInputStream(msghdr, reusable);
  
  let sstream=Components.classes["@mozilla.org/scriptableinputstream;1"]
                        .createInstance(Components.interfaces.nsIScriptableInputStream);
  sstream.init(stream);

  let restant=Math.min(alire, 1000);//4096
  let str=sstream.read(restant);
  alire-=restant;

  let sep="\r\n";
  let pos=str.indexOf("\r\n");
  if (-1==pos)
    sep="\n";
  
  function chercheFin(str, pos){
    
    // chercher fin commentaire
    let fin=str.indexOf(sep, pos);
    let posfin=-1;
    
    while (-1!=fin){         
      if (" "!=str.charAt(fin+sep.length)){
        posfin=fin;
        break;
      }
      
      fin=str.indexOf(sep, fin+sep.length);
    } 
    
    return posfin;
  }
  
  let present=false;
  while (0<str.length) {

    if (!present){
      
      pos=str.indexOf(ENTETE_COMMENTAIRE);
      if (-1!=pos){
        // debut commentaire
        present=true;
        // chercher fin commentaire
        let posfin=chercheFin(str, pos);
        
        if (-1!=posfin){
          comment=str.substr(pos+ENTETE_COMMENTAIRE.length, posfin-(pos+ENTETE_COMMENTAIRE.length));   
          break;
          
        } else      
          comment=str.substr(pos+ENTETE_COMMENTAIRE.length);
      }
      
    } else {
      // continuer sur commentaire
      // chercher fin commentaire
      let posfin=chercheFin(str, 0);
      if (-1!=posfin){
        comment+=str.substr(0, posfin); 
        break;
        
      } else      
        comment+=str;
    }
    
    if (0>=alire)
      break;
    
    restant=Math.min(alire, 1000);//4096
    str=sstream.read(restant);
    alire-=restant;
  }
  
  sstream.close();
  stream.close();
  
  let mimeDecoder=Components.classes["@mozilla.org/messenger/mimeconverter;1"]
                            .getService(Components.interfaces.nsIMimeConverter);
                            
  return mimeDecoder.decodeMimeHeaderToUTF8(comment, msghdr.effectiveCharset, false, true);
}
