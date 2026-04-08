Clazz.declarePackage("J.image");
Clazz.load(["J.api.JmolMovieCreatorInterface"], "J.image.AviCreator", null, function(){
var c$ = Clazz.decorateAsClass(function(){
this.errorMsg = null;
Clazz.instantialize(this, arguments);}, J.image, "AviCreator", null, J.api.JmolMovieCreatorInterface);
Clazz.overrideMethod(c$, "createMovie", 
function(vwr, files, width, height, fps, fileName){
return this.errorMsg;
}, "JV.Viewer,~A,~N,~N,~N,~S");
});
;//5.0.1-v7 Sat Feb 21 18:17:38 CST 2026
