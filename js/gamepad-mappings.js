/**
 * GENvault - Custom Gamepad Mappings
 *
 * 8BitDo M30 2.4G USB Receiver
 * ID: 6B controller (Vendor: 0ca3 Product: 0024)
 *
 * Este archivo NO modifica Genesis.js/PicoDrive.
 * Traduce el M30 a los controles de teclado que utiliza Genesis.js.
 */

(() => {
    "use strict";

    // ============================================================
    // CONFIGURACIÓN
    // ============================================================

    const M30_VENDOR = "0ca3";
    const M30_PRODUCT = "0024";

    // Mapping físico del 8BitDo M30 detectado mediante Gamepad API.
    //
    //        X(3)  Y(0)  Z(4)
    //        A(2)  B(1)  C(5)
    //
    // Start = 9
    // L = 6
    // R = 7

    const M30_BUTTONS = {
        2: "KeyA", // M30 A → Genesis A
        1: "KeyS", // M30 B → Genesis B
        5: "KeyD", // M30 C → Genesis C

        3: "KeyQ", // M30 X → Genesis X
        0: "KeyW", // M30 Y → Genesis Y
        4: "KeyE", // M30 Z → Genesis Z

        9: "Enter" // M30 Start → Genesis Start
    };

    // ============================================================
    // ESTADO
    // ============================================================

    const previousButtons = {};

    const previousDirections = {
        up: false,
        down: false,
        left: false,
        right: false
    };

    let activeM30Index = null;
    let wasConnected = false;

    // ============================================================
    // DETECCIÓN DEL M30
    // ============================================================

    function isM30(gamepad) {
        if (!gamepad || !gamepad.id) {
            return false;
        }

        const id = gamepad.id.toLowerCase();

        return (
            id.includes(`vendor: ${M30_VENDOR}`) &&
            id.includes(`product: ${M30_PRODUCT}`)
        );
    }

    // ============================================================
    // EVENTOS DE TECLADO
    // ============================================================

    function sendKey(code, pressed) {
        const eventType = pressed ? "keydown" : "keyup";

        const event = new KeyboardEvent(eventType, {
            code: code,
            key: getKeyValue(code),
            bubbles: true,
            cancelable: true
        });

        document.dispatchEvent(event);
    }

    function getKeyValue(code) {
        const keys = {
            KeyA: "a",
            KeyS: "s",
            KeyD: "d",

            KeyQ: "q",
            KeyW: "w",
            KeyE: "e",

            Enter: "Enter",

            ArrowUp: "ArrowUp",
            ArrowDown: "ArrowDown",
            ArrowLeft: "ArrowLeft",
            ArrowRight: "ArrowRight"
        };

        return keys[code] || code;
    }

    // ============================================================
    // BOTONES
    // ============================================================

    function updateButton(index, pressed) {
        if (previousButtons[index] === pressed) {
            return;
        }

        previousButtons[index] = pressed;

        const code = M30_BUTTONS[index];

        if (code) {
            sendKey(code, pressed);
        }
    }

    // ============================================================
    // D-PAD
    // ============================================================

    function updateDirection(name, code, pressed) {
        if (previousDirections[name] === pressed) {
            return;
        }

        previousDirections[name] = pressed;

        sendKey(code, pressed);
    }

    // ============================================================
    // RESET
    // ============================================================

    function releaseAllInputs() {
        Object.entries(M30_BUTTONS).forEach(([index, code]) => {
            if (previousButtons[index]) {
                sendKey(code, false);
            }

            previousButtons[index] = false;
        });

        const directions = {
            up: "ArrowUp",
            down: "ArrowDown",
            left: "ArrowLeft",
            right: "ArrowRight"
        };

        Object.entries(directions).forEach(([name, code]) => {
            if (previousDirections[name]) {
                sendKey(code, false);
            }

            previousDirections[name] = false;
        });
    }

    // ============================================================
    // BUSCAR M30
    // ============================================================

    function findM30() {
        const gamepads = navigator.getGamepads
            ? navigator.getGamepads()
            : [];

        for (const gamepad of gamepads) {
            if (gamepad && isM30(gamepad)) {
                return gamepad;
            }
        }

        return null;
    }

    // ============================================================
    // LOOP PRINCIPAL
    // ============================================================

    function pollGamepad() {
        const gamepad = findM30();

        if (!gamepad) {
            if (wasConnected) {
                console.log("[GENvault] 8BitDo M30 desconectado");

                releaseAllInputs();

                wasConnected = false;
                activeM30Index = null;
            }

            requestAnimationFrame(pollGamepad);
            return;
        }

        if (!wasConnected || activeM30Index !== gamepad.index) {
            console.log(
                "[GENvault] 8BitDo M30 detectado:",
                gamepad.id
            );

            console.log(
                "[GENvault] Mapping especial M30 activado"
            );

            wasConnected = true;
            activeM30Index = gamepad.index;
        }

        // ----------------------------------------------------------
        // Botones A/B/C/X/Y/Z/Start
        // ----------------------------------------------------------

        Object.keys(M30_BUTTONS).forEach(index => {
            const buttonIndex = Number(index);

            const pressed =
                gamepad.buttons[buttonIndex]?.pressed === true;

            updateButton(buttonIndex, pressed);
        });

        // ----------------------------------------------------------
        // D-Pad
        // ----------------------------------------------------------

        // --- DEBUG TEMPORAL: borrar esto una vez identificado el eje/bot\u00f3n correcto ---
        console.log("[GENvault][DEBUG] axes:", gamepad.axes.map((v, i) => `${i}:${v.toFixed(2)}`).join(" "));
        console.log("[GENvault][DEBUG] buttons:", gamepad.buttons.map((b, i) => b.pressed ? i : null).filter(i => i !== null));
        // --- FIN DEBUG ---

        const axisX = gamepad.axes[0] || 0;
        const axisY = gamepad.axes[1] || 0;

        const DEADZONE = 0.5;

        updateDirection(
            "left",
            "ArrowLeft",
            axisX < -DEADZONE
        );

        updateDirection(
            "right",
            "ArrowRight",
            axisX > DEADZONE
        );

        updateDirection(
            "up",
            "ArrowUp",
            axisY < -DEADZONE
        );

        updateDirection(
            "down",
            "ArrowDown",
            axisY > DEADZONE
        );

        requestAnimationFrame(pollGamepad);
    }

    // ============================================================
    // INICIO
    // ============================================================

    window.addEventListener("gamepadconnected", event => {
        if (isM30(event.gamepad)) {
            console.log(
                "[GENvault] Conectado:",
                event.gamepad.id
            );
        }
    });

    window.addEventListener("gamepaddisconnected", event => {
        if (isM30(event.gamepad)) {
            releaseAllInputs();

            wasConnected = false;
            activeM30Index = null;
        }
    });

    requestAnimationFrame(pollGamepad);

})();
