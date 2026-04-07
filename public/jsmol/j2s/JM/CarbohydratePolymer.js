Clazz.declarePackage("JM");
Clazz.load(["JM.BioPolymer"], "JM.CarbohydratePolymer", null, function(){
var c$ = Clazz.declareType(JM, "CarbohydratePolymer", JM.BioPolymer);
Clazz.makeConstructor(c$, 
function(monomers){
Clazz.superConstructor(this, JM.CarbohydratePolymer, [monomers, false]);
this.type = 3;
}, "~A");
});
;//5.0.1-v7 Sat Feb 28 09:57:54 CST 2026
