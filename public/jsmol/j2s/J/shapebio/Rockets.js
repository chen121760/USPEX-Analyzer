Clazz.declarePackage("J.shapebio");
Clazz.load(["J.shapebio.BioShapeCollection"], "J.shapebio.Rockets", null, function(){
var c$ = Clazz.declareType(J.shapebio, "Rockets", J.shapebio.BioShapeCollection);
Clazz.overrideMethod(c$, "initShape", 
function(){
this.setTurn();
});
Clazz.defineMethod(c$, "setTurn", 
function(){
this.madTurnRandom = 500;
});
});
;//5.0.1-v7 Sat Feb 21 18:17:38 CST 2026
