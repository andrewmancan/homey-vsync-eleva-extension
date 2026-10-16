import Homey from "homey";
import VeSyncApp from "../../app";
import {Utils} from "../../utils";
import Eleva300X from "../../tsvesync/devices/purifier/Eleva300X";

class Eleva300XDriver extends Homey.Driver {
    async onInit() {
        this.homey.flow.getActionCard("set_eleva_mode").registerRunListener(async (args) =>
            args.device.triggerCapabilityListener("eleva_mode", args.mode));
        this.homey.flow.getActionCard("set_eleva_child_lock").registerRunListener(async (args) =>
            args.device.triggerCapabilityListener("eleva_child_lock", args.enabled));
    }

    async onPair(session: any) {
        session.setHandler("showView", async (view: string) => {
            if (view === "login" && (this.homey.app as VeSyncApp).veSync.isLoggedIn()) await session.nextView();
        });
        session.setHandler("login", async (data: any) => Utils.handleLogin(this, data));
        session.setHandler("list_devices", async () => {
            const devices = await (this.homey.app as VeSyncApp).veSync.getDevices();
            return devices.filter((device) => device instanceof Eleva300X).map((device) => ({
                name: device.device.deviceName,
                data: {id: device.device.uuid, cid: device.device.cid, macID: device.device.macID},
            }));
        });
    }

    async onRepair(session: any, device: any) {
        session.setHandler("login", async (data: any) => {
            const result = await Utils.handleLogin(this, data);
            if (result) await device.getDevice();
            return result;
        });
    }
}

module.exports = Eleva300XDriver;
