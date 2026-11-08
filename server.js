const express = require('express');
const cors = require('cors');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

const app = express();
app.use(cors()); // Permet à votre index.html de communiquer avec ce serveur
app.use(express.json());

let sock = null;

// Initialisation et gestion de la connexion aux serveurs de WhatsApp
async function initWhatsAppConnection() {
    // Dossier local où seront stockées vos clés de session une fois associées
    const { state, saveCreds } = await useMultiFileAuthState('session_zodyl_lab');

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Désactivé car on utilise l'authentification par numéro
        logger: pino({ level: 'silent' }) // Évite de saturer la console avec les logs internes de WhatsApp
    });

    // Sauvegarde automatique des identifiants cryptographiques
    sock.ev.on('creds.update', saveCreds);

    // Écouteur de statut de connexion
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[Lab] Connexion fermée. Raison :', lastDisconnect?.error, 'Reconnexion automatique :', shouldReconnect);
            if (shouldReconnect) {
                initWhatsAppConnection(); // Relance si ce n'est pas une déconnexion volontaire
            }
        } else if (connection === 'open') {
            console.log('[✓] Le laboratoire ZODYL est connecté avec succès aux serveurs de WhatsApp !');
        }
    });
}

// Lancement initial de la connexion WhatsApp en tâche de fond
initWhatsAppConnection();

/**
 * API ROUTE : /api/demander-code
 * Reçoit le numéro de téléphone et demande le code d'association officiel à WhatsApp
 */
app.post('/api/demander-code', async (req, res) => {
    let { numero } = req.body;

    if (!numero) {
        return res.status(400).json({ error: "Numéro de téléphone manquant." });
    }

    // Nettoyage sommaire du numéro (suppression des espaces, +, tirets)
    numero = numero.replace(/\s+/g, '').replace('+', '');

    try {
        console.log(`[Lab] Tentative de génération d'un code WhatsApp officiel pour : ${numero}`);

        // Requête officielle transmise à l'infrastructure de WhatsApp
        // Le serveur renverra une chaîne au format XXXX-XXXX (ex: A1B2-C3D4)
        const codeLiaison = await sock.requestPairingCode(numero);

        console.log(`[Lab] Code généré avec succès par WhatsApp : ${codeLiaison}`);

        // On retourne le vrai code généré à l'interface HTML
        return res.json({ success: true, code: codeLiaison });

    } catch (error) {
        console.error("[Erreur Serveur]", error);

        // Gestion des erreurs courantes de protection de l'infrastructure de WhatsApp
        return res.status(500).json({
            error: "Impossible de générer le code.",
            details: "WhatsApp a rejeté la demande. Vérifiez le format ou attendez quelques heures (sécurité anti-spam)."
        });
    }
});

// Port d'écoute local du serveur
// INDIQUE AU SERVEUR D'AFFICHER VOTRE FICHIER HTML SUR LE LIEN RENDER
const path = require('path');

// Permet au serveur de charger vos images et styles présents dans le dossier
app.use(express.static(__dirname));

// Si quelqu'un visite la racine du lien ( / ), le serveur lui envoie votre index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`[✓] SERVEUR BACKEND ZODYL-MORTEL EN COURS D'EXÉCUTION `);
    console.log(`    Adresse : http://localhost:${PORT}`);
    console.log(`=======================================================`);
});

