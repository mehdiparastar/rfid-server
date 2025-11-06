import dns from "dns/promises";

/**
 * Resolves hostnames in JRD_DEVICES to IPs.
 * Removes any entries that cannot be resolved.
 *
 * Example:
 *  Input:  com7@esp32-jrd-com7.local:33940,com8@esp32-jrd-com8.local:33950
 *  Output: com7@192.168.1.42:33940  (if second fails)
 */
export async function resolveDeviceEnvVariable(): Promise<void> {
    const envValue = process.env.JRD_DEVICES;
    if (!envValue) {
        console.warn("⚠️ JRD_DEVICES not set");
        return;
    }

    const parts = envValue.split(",").map((item) => item.trim()).filter(Boolean);

    const resolvedParts = (
        await Promise.all(
            parts.map(async (item) => {
                const [portName, hostPart] = item.split("@");
                const [hostname, portStr] = hostPart.split(":");
                const port = Number(portStr);

                // Skip invalid syntax
                if (!portName || !hostname || isNaN(port)) return null;

                let ip = hostname;
                // If not already IP, try to resolve
                if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
                    try {
                        const res = await dns.lookup(hostname, { family: 4 });
                        ip = res.address;
                        console.log(`✅ ${hostname} → ${ip}`);
                    } catch (err) {
                        console.warn(`⚠️ Failed to resolve ${hostname}, skipping.`);
                        return null; // skip unresolved host
                    }
                }

                return `${portName}@${ip}:${port}`;
            })
        )
    ).filter((item): item is string => !!item); // remove nulls

    const newValue = resolvedParts.join(",");
    process.env.JRD_DEVICES = newValue;

    console.log("✅ Final JRD_DEVICES:", newValue || "(none)");
}
