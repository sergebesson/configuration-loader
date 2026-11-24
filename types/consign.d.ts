declare module "consign" {
	interface Consign {
		include(path: string): Consign;
		into(context: object): Consign;
	}

	function consign(options: {cwd: string; verbose: boolean}): Consign;
	export default consign;
}
