declare module "dot-object" {
	// La version 2 renvoie l'objet cible ; les types publiés déclarent void.
	export function transform(recipe: Record<string, unknown>, source: Record<string, string | undefined>): Record<string, unknown>;
}
