import HomeyDeviceBase from "../../lib/HomeyDeviceBase";
import VeSyncApp from "../../app";
import Eleva300X, {ElevaStatus} from "../../tsvesync/devices/purifier/Eleva300X";
import {getErrorMessage} from "../../lib/utils/error";

class Eleva300XDevice extends HomeyDeviceBase {
    device?: Eleva300X;
    private previous: ElevaStatus | null = null;
    private commandQueue: Promise<unknown> = Promise.resolve();

    async onInit() {
        this.registerCapabilityListener("onoff", async (value) => this.control(async () => {
            await this.runCommandWithOptimisticCapabilities([
                {capability: "onoff", value},
                ...(!value ? [{capability: "eleva_mode", value: "off"}] : []),
            ], () => this.device!.setSwitch(value));
        }));
        this.registerCapabilityListener("eleva_mode", async (value) => this.control(() => this.setMode(value)));
        this.registerCapabilityListener("fanSpeed0to4", async (value) => this.control(() => this.setFan(value)));
        this.registerCapabilityListener("display_toggle", async (value) => this.control(() =>
            this.runCommandWithOptimisticCapability("display_toggle", value, () => this.device!.setDisplay(value))));
        this.registerCapabilityListener("eleva_child_lock", async (value) => this.control(() =>
            this.runCommandWithOptimisticCapability("eleva_child_lock", value, () => this.device!.setChildLock(value))));
        await this.startDevicePolling(() => this.getDevice(), () => this.updateDevice(), 60_000);
    }

    private async control(command: () => Promise<void>): Promise<void> {
        const pending = this.commandQueue.then(async () => {
            if (!this.device || !this.getAvailable()) throw new Error("Eleva is unavailable. Check VeSync or repair the device.");
            await command();
            await this.updateDevice();
        });
        this.commandQueue = pending.catch(() => undefined);
        await pending;
    }

    private async powerOnIfNeeded(): Promise<void> {
        if (!this.device!.status?.enabled) await this.device!.setSwitch(true);
    }

    private async setFan(level: number): Promise<void> {
        if (!Number.isInteger(level) || level < 0 || level > 4) throw new Error("Choose fan level 0–4.");
        if (level === 0) { await this.setMode("off"); return; }
        await this.runCommandWithOptimisticCapabilities([
            {capability: "onoff", value: true},
            {capability: "eleva_mode", value: "manual"},
            {capability: "fanSpeed0to4", value: level},
        ], async () => {
            await this.powerOnIfNeeded();
            return this.device!.setLevel(level);
        });
    }

    private async setMode(mode: string): Promise<void> {
        if (mode === "manual") { await this.setFan(this.device!.status?.manualLevel ?? 1); return; }
        if (mode !== "off" && mode !== "auto" && mode !== "sleep") throw new Error("Unsupported Eleva mode.");
        await this.runCommandWithOptimisticCapabilities([
            {capability: "onoff", value: mode !== "off"},
            {capability: "eleva_mode", value: mode},
        ], async () => {
            if (mode === "off") return this.device!.setSwitch(false);
            await this.powerOnIfNeeded();
            return this.device!.setPurifierMode(mode);
        });
    }

    async getDevice(): Promise<void> {
        const api = (this.homey.app as VeSyncApp).veSync;
        if (!api?.isLoggedIn()) {
            await this.setUnavailable("Sign in to VeSync through the device pairing/repair screen.");
            throw new Error("VeSync login is required.");
        }
        const device = this.findStoredVeSyncDevice(api.getStoredDevice());
        if (!(device instanceof Eleva300X)) {
            await this.setUnavailable("LAP-C341S-WUSZ was not found in this VeSync account.");
            throw new Error("Eleva was not found in VeSync.");
        }
        this.device = device;
    }

    private async reading(capability: string, value: number | boolean | string | null): Promise<void> {
        if (!this.hasCapability(capability)) return;
        if (value === null) await this.setCapabilityValue(capability, null);
        else await this.setCapabilityIfPresent(capability, value);
    }

    async updateDevice(): Promise<void> {
        if (!this.device) return;
        let current: ElevaStatus;
        try { current = await this.device.getPurifierStatus(); }
        catch (error) { await this.handleDeviceStatusFailure(getErrorMessage(error), true); return; }
        await this.markDeviceOnline();
        await this.reading("onoff", current.enabled);
        await this.reading("eleva_mode", current.enabled ? current.mode : "off");
        // Slider is the manual preset, not measured RPM or automatic fan speed.
        await this.reading("fanSpeed0to4", current.enabled ? current.manualLevel : 0);
        await this.reading("measure_pm25", current.pm25);
        await this.reading("measure_pm1_eleva", current.pm1);
        await this.reading("measure_pm10_eleva", current.pm10);
        await this.reading("measure_filter_life", current.hepaLife);
        await this.reading("measure_carbon_filter_life_eleva", current.carbonLife);
        await this.reading("display_toggle", current.display);
        await this.reading("eleva_child_lock", current.childLock);
        await this.triggerChanges(current);
        this.previous = current;
    }

    private async triggerChanges(current: ElevaStatus): Promise<void> {
        const before = this.previous;
        if (!before) return;
        const changed = async (card: string, value: number | null, previous: number | null) => {
            if (value !== null && previous !== null && value !== previous)
                await this.homey.flow.getDeviceTriggerCard(card).trigger(this, {value, previous}).catch(this.error);
        };
        await changed("eleva_pm1_changed", current.pm1, before.pm1);
        await changed("eleva_pm10_changed", current.pm10, before.pm10);
        await changed("eleva_carbon_life_changed", current.carbonLife, before.carbonLife);
        if (current.pm25 !== null && before.pm25 !== null && current.pm25 !== before.pm25) {
            await this.homey.flow.getDeviceTriggerCard("pm25_above_threshold").trigger(this, {
                pm25: current.pm25, previous_pm25: before.pm25, quality: "", previous_quality: "",
            }, {pm25: current.pm25, previous_pm25: before.pm25}).catch(this.error);
        }
        if (current.hepaLife !== null && before.hepaLife !== null && current.hepaLife !== before.hepaLife) {
            await this.homey.flow.getDeviceTriggerCard("filter_life_below_threshold").trigger(this, {
                filter_life: current.hepaLife, previous_filter_life: before.hepaLife,
            }, {filter_life: current.hepaLife, previous_filter_life: before.hepaLife}).catch(this.error);
        }
    }
}

module.exports = Eleva300XDevice;
