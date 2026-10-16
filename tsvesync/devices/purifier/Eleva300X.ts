import BasicDevice from "../../lib/BasicDevice";
import IApiResponse from "../../models/IApiResponse";
import DeviceModes from "../../enum/DeviceModes";

export interface ElevaStatus {
    enabled: boolean;
    mode: "auto" | "manual" | "sleep" | null;
    manualLevel: number | null;
    actualLevel: number | null;
    pm1: number | null;
    pm25: number | null;
    pm10: number | null;
    hepaLife: number | null;
    carbonLife: number | null;
    display: boolean | null;
    childLock: boolean | null;
}

/** LAP-C341S-WUSZ protocol documented in pyvesync PR #546. */
export default class Eleva300X extends BasicDevice {
    static deviceModels = ["LAP-C341S-WUSZ"];
    static methods = ["getPurifierStatus", "setSwitch", "setLevel", "setPurifierMode", "setDisplay", "setChildLock"];
    static modes = [DeviceModes.Auto, DeviceModes.Manual, DeviceModes.Sleep];
    static features = ["air_quality"];
    status: ElevaStatus | null = null;

    private static number(value: unknown, max = Infinity): number | null {
        // Missing readings must stay unknown, rather than becoming zero / clean air.
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) return null;
        return value;
    }

    private static switch(value: unknown): boolean | null {
        return value === 1 ? true : value === 0 ? false : null;
    }

    static parseStatus(raw: any): ElevaStatus {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Eleva returned no status data.");
        const enabled = this.switch(raw.powerSwitch);
        if (enabled === null) throw new Error("Eleva returned an invalid power state.");
        const mode = ["auto", "manual", "sleep"].includes(raw.workMode) ? raw.workMode : null;
        const manual = this.number(raw.manualSpeedLevel, 4);
        const actual = this.number(raw.fanSpeedLevel, 4); // 255 means unavailable, not speed 255.
        return {
            enabled, mode,
            manualLevel: manual !== null && Number.isInteger(manual) && manual >= 1 ? manual : null,
            actualLevel: actual !== null && Number.isInteger(actual) ? actual : null,
            pm1: this.number(raw.PM1), pm25: this.number(raw.PM25), pm10: this.number(raw.PM10),
            hepaLife: this.number(raw.filterLifePercent, 100),
            carbonLife: this.number(raw.carbonFilterLifePercent, 100),
            display: this.switch(raw.screenSwitch), childLock: this.switch(raw.childLockSwitch),
        };
    }

    private assertSuccess(response: IApiResponse<any>): void {
        const inner = response?.result;
        if (!response || response.code !== 0 || response.msg !== "request success"
            || (inner?.code !== undefined && inner.code !== 0)
            || (inner?.result?.code !== undefined && inner.result.code !== 0)) {
            throw new Error(`Eleva request failed: ${response?.msg ?? "no response"} (code ${inner?.result?.code ?? inner?.code ?? response?.code ?? "unknown"}).`);
        }
    }

    async getPurifierStatus(): Promise<ElevaStatus> {
        const response = await this.post<any>("getPurifierStatus", {});
        this.assertSuccess(response);
        const parsed = Eleva300X.parseStatus(response.result?.result);
        this.status = parsed;
        return parsed;
    }

    private async command(method: string, payload: object): Promise<IApiResponse<any>> {
        const response = await this.post<any>(method, payload);
        this.assertSuccess(response);
        return response;
    }

    async setSwitch(value: boolean): Promise<IApiResponse<any>> {
        return this.command("setSwitch", {powerSwitch: Number(value), switchIdx: 0});
    }

    async setLevel(value: number): Promise<IApiResponse<any>> {
        if (!Number.isInteger(value) || value < 1 || value > 4) throw new Error("Eleva fan level must be 1–4.");
        // Level 4 is Turbo. It is NOT a separate workMode on this model.
        return this.command("setLevel", {levelIdx: 0, levelType: "wind", manualSpeedLevel: value});
    }

    async setPurifierMode(value: "auto" | "sleep"): Promise<IApiResponse<any>> {
        if (value !== "auto" && value !== "sleep") throw new Error("Use a fan level for manual/Turbo mode.");
        return this.command("setPurifierMode", {workMode: value});
    }

    async setDisplay(value: boolean): Promise<IApiResponse<any>> {
        return this.command("setDisplay", {screenSwitch: Number(value)});
    }

    async setChildLock(value: boolean): Promise<IApiResponse<any>> {
        return this.command("setChildLock", {childLockSwitch: Number(value)});
    }
}
