/** @param {NS} ns */
export async function main(ns) {
	const maxRam = ns.cloud.getRamLimit ? ns.cloud.getRamLimit() : 2 ** 20;

	ns.tprint("RAM (GB) | Purchase Cost");
	ns.tprint("---------|--------------");
	for (let ram = 2; ram <= maxRam; ram *= 2) {
		const cost = ns.cloud.getServerCost(ram);
		ns.tprint(`${ns.format.ram(ram).padEnd(8)} | $${ns.format.number(cost)}`);
	}
}
