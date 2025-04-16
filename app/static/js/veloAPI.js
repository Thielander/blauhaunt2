// Definition von globalen Variablen
let artifactName = "Custom.Windows.EventLogs.Blauhaunt";  // Name des Artefakts, das abgerufen wird
let monitoringArtifact = "Custom.Windows.Events.Blauhaunt"; // Artefakt für Monitoring-Daten
let velo_url = window.location.origin;  // Basis-URL der aktuellen Seite
let BLAUHAUNT_TAG = "Blauhaunt"; // Tag zur Identifikation relevanter Hunts
let header = {};  // Objekt zur Speicherung von Header-Informationen für API-Requests

checkForVelociraptor(); // Initialer Check beim Laden, ob Velociraptor verfügbar ist

// Öffnet ein modales Auswahlfenster mit einer Liste zur Auswahl
function selectionModal(title, selectionList) {
    // Entfernt doppelte Einträge aus der Liste
    selectionList = [...new Set(selectionList)];

    let modal = new Promise((resolve, reject) => {
        // Erstellt Modal-Struktur
        let modal = document.createElement("div");
        modal.id = "modal";
        modal.className = "modal";

        let modalContent = document.createElement("div");
        modalContent.className = "modal-content";

        let modalHeader = document.createElement("h2");
        modalHeader.innerHTML = title;
        modalContent.appendChild(modalHeader);

        let modalBody = document.createElement("div");
        modalBody.className = "modal-body";

        // Fügt Buttons für jedes Auswahl-Element hinzu
        selectionList.forEach(option => {
            let notebookButton = document.createElement("button");
            notebookButton.innerHTML = option;
            notebookButton.onclick = function () {
                modal.remove(); // entfernt das Modal
                return option;  // Rückgabe der Auswahl
            };
            modalBody.appendChild(notebookButton);
        });

        modalContent.appendChild(modalBody);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Zeigt Modal an
        modal.style.display = "block";

        // Schließt das Modal bei Klick außerhalb
        window.onclick = function (event) {
            if (event.target === modal) {
                modal.remove();
                return null;
            }
        };
    });

    return modal;
}

// Ruft ein Notebook mit spezifischem Hunt ID ab
function getNotebook(huntID) {
    let notebooks = [];
    fetch(velo_url + '/api/v1/GetHunt?hunt_id=' + huntID, {headers: header})
        .then(response => response.json())
        .then(data => {
            let artifacts = data.artifacts;
            let notebookID = "";

            // Prüft ob das relevante Artefakt enthalten ist
            artifacts.forEach(artifact => {
                notebookID = "N." + huntID;
                if (artifact === artifactName) {
                    notebooks.push(notebookID);
                }
            });

            // Wenn keine relevanten Notebooks gefunden wurden
            if (notebooks.length === 0) return;

            // Bei mehreren Notebooks Auswahl anzeigen
            if (notebooks.length > 1) {
                selectionModal("Select Notebook", notebooks).then(selectedNotebook => {
                    if (selectedNotebook === null) return;
                    getCells(selectedNotebook);
                });
            } else {
                getCells(notebooks[0]);
            }
        });
}

// Holt alle Cells eines Notebooks und verarbeitet sie
function getCells(notebookID) {
    fetch(velo_url + `/api/v1/GetNotebooks?notebook_id=${notebookID}&include_uploads=true`, {headers: header})
        .then(response => {
            // CSRF-Token speichern
            localStorage.setItem('csrf-token', response.headers.get("X-Csrf-Token"));
            return response.json();
        })
        .then(data => {
            let cells = data.items;

            // Wenn mehr als eine Cell vorhanden ist, Liste generieren
            if (cells.length > 1) {
                let cellIDs = {};
                cells.forEach(cell => {
                    cell.cell_metadata.forEach(metadata => {
                        let suffix = "";
                        let i = 0;
                        while (cellIDs[metadata.cell_id + suffix] !== undefined) {
                            suffix = "_" + i++;
                        }
                        cellIDs[metadata.cell_id + suffix] = {
                            cell_id: metadata.cell_id,
                            version: metadata.timestamp
                        };
                    });
                });

                // Auswahl anzeigen
                selectionModal("Select Cell", Object.keys(cellIDs)).then(selectedCell => {
                    if (selectedCell === null) return;
                    updateData(
                        notebookID,
                        cellIDs[selectedCell].cell_id,
                        cellIDs[selectedCell].version,
                        localStorage.getItem('csrf-token')
                    );
                });
            }

            // Alle Cells verarbeiten
            cells.forEach(cell => {
                cell.cell_metadata.forEach(metadata => {
                    updateData(
                        notebookID,
                        metadata.cell_id,
                        metadata.timestamp,
                        localStorage.getItem('csrf-token')
                    );
                });
            });
        });
}


// Sendet eine Update-Anfrage für eine Notebook-Cell
function updateData(notebookID, cellID, version, csrf_token) {
    header["X-Csrf-Token"] = csrf_token;

    fetch(velo_url + '/api/v1/UpdateNotebookCell', {
        method: 'POST',
        headers: header,
        body: JSON.stringify({
            "notebook_id": notebookID,
            "cell_id": cellID,
            "env": [{"key": "ArtifactName", "value": artifactName}],
            "input": "\n/*\n# BLAUHAUNT\n*/\nSELECT * FROM source(artifact=\"" + artifactName + "\")\n",
            "type": "vql"
        })
    }).then(response => response.json())
      .then(data => {
        loadData(notebookID, data.cell_id, data.current_version);
    });
}

// Hier wird die Antwortzeilen gespeichert
let dataRows = [];

// Holt tabellarische Daten einer Cell und speichert diese
function loadData(notebookID, cellID, version, startRow = 0, toRow = 1000) {
    fetch(velo_url + `/api/v1/GetTable?notebook_id=${notebookID}&client_id=&cell_id=${cellID}-${version}&table_id=1&TableOptions=%7B%7D&Version=${version}&start_row=${startRow}&rows=${toRow}&sort_direction=false`,
        {headers: header}
    ).then(response => response.json())
     .then(data => {
        if (!data.rows) return;

        let keys = data.columns;
        data.rows.forEach(row => {
            let rowData = JSON.parse(row.json);
            let entry = {};
            for (let i = 0; i < rowData.length; i++) {
                entry[keys[i]] = rowData[i];
            }
            dataRows.push(JSON.stringify(entry));
        });

        // Spinner anzeigen
        document.getElementById("loading").style.display = "block";

        // Verarbeitung starten
        processJSONUpload(dataRows.join("\n")).then(() => {
            document.getElementById("loading").style.display = "none";
        });

        // Weitere Daten laden, falls vorhanden
        if (data.total_rows > toRow) {
            loadData(notebookID, cellID, version, startRow + toRow, toRow + 1000);
        }

        // Daten lokal speichern
        storeDataToIndexDB(header["Grpc-Metadata-Orgid"]);
    });
}

function getHunts(orgID) {
    velo_url = window.location.origin
    const oldAPI = '/api/v1/ListHunts?count=2000&offset=0&summary=true&user_filter=';
    const newAPI = "/api/v1/GetHuntTable?version=1&start_row=0&rows=20000&sort_direction=false"
    fetch(velo_url + newAPI, {headers: header}).then(response => {
        return response.json()
    }).then(data => {
        try {
            console.debug(data)
            let keys = data.columns;
            let huntList = []
            for (let hunt of data.rows) {
                let h = {}
                let huntData = JSON.parse(hunt.json);
                for (let i = 0; i < keys.length; i++) {
                    h[keys[i]] = huntData[i];
                }
                h.Tags = h.Tags || [] // to prevent errors when Tags is not set
                huntList.push(h);
            }
            huntList.forEach(hunt => {
                console.debug(hunt)
                console.debug(hunt.Tags.includes(BLAUHAUNT_TAG))
                if (hunt.Tags.includes(BLAUHAUNT_TAG)) {
                    console.debug("Blauhaunt Hunt found:")
                    console.debug(hunt)
                    getNotebook(hunt.HuntId);
                }
            });
        } catch (error) {
            console.debug(error)
            console.debug("error in getHunts")
        }
    })
}

function updateClientInfoData(clientInfoNotebook, cellID, version) {
    header["X-Csrf-Token"] = localStorage.getItem('csrf-token')
    fetch(velo_url + '/api/v1/UpdateNotebookCell', {
        method: 'POST',
        headers: header,
        body: JSON.stringify({
            "notebook_id": clientInfoNotebook,
            "cell_id": cellID,
            "env": [{"key": "ArtifactName", "value": artifactName}],
            "input": "SELECT * FROM clients()\n",
            "type": "vql"
        })
    }).then(response => {
        return response.json()
    }).then(data => {
        console.debug("Notebook Data:")
        console.debug(data)
        cellID = data.cell_id;
        version = data.current_version;
        let timestamp = data.timestamp;
        loadFromClientInfoCell(clientInfoNotebook, cellID, version, timestamp);
    });
}

function getClientInfoFromVelo() {
    fetch(velo_url + '/api/v1/GetNotebooks?count=1000&offset=0', {headers: header}).then(response => {
        localStorage.setItem('csrf-token', response.headers.get("X-Csrf-Token"))
        return response.json()
    }).then(data => {
        let notebooks = data.items;
        if (!notebooks) {
            createClientinfoNotebook()
        } else {
            let clientInfoNotebook = ""
            notebooks.forEach(notebook => {
                let notebookID = notebook.notebook_id;
                notebook.cell_metadata.forEach(metadata => {
                    let cellID = metadata.cell_id;
                    fetch(velo_url + `/api/v1/GetNotebookCell?notebook_id=${notebookID}&cell_id=${cellID}`, {headers: header}).then(response => {
                        return response.json()
                    }).then(data => {
                        let query = data.input;
                        if (query.trim().toLowerCase() === 'select * from clients()') {
                            let version = metadata.current_version;
                            let timestamp = metadata.timestamp;
                            updateClientInfoData(notebookID, cellID, version, timestamp);
                        }
                    });
                });
            });
        }
    });
}

function createClientinfoNotebook() {
    header["X-Csrf-Token"] = localStorage.getItem('csrf-token')
    fetch("/api/v1/NewNotebook", {
        headers: header,
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": "{\"name\":\"Blauhaunt Clientinfo\",\"description\":\"Auto created\",\"public\":true,\"artifacts\":[\"Notebooks.Default\"],\"specs\":[]}",
        "method": "POST",
        "mode": "cors",
        "credentials": "include"
    }).then(response => {
        return response.json().then(data => {
            console.debug("Notebook for client info created")
            console.debug(data)
            let clientInfoNotebook = data.notebook_id;
            let cellID = data.cell_metadata[0].cell_id;
            let version = data.cell_metadata[0].current_version;
            fetch("/api/v1/UpdateNotebookCell", {
                headers: header,
                "body": `{"notebook_id":"${clientInfoNotebook}","cell_id":"${cellID}","type":"vql","currently_editing":false,"input":"select * from clients()"}`,
                "method": "POST",
                "mode": "cors",
                "credentials": "include"
            }).then(response => {
                return response.json().then(data => {
                    console.debug("Notebook Data:")
                    console.debug(data)
                    cellID = data.cell_id;
                    version = data.current_version;
                    let timestamp = data.timestamp;
                    loadFromClientInfoCell(clientInfoNotebook, cellID, version, timestamp);
                });
            });
        })
    });
}

function loadFromClientInfoCell(notebookID, cellID, version, timestamp, startRow = 0, toRow = 1000) {
    fetch(velo_url + `/api/v1/GetTable?notebook_id=${notebookID}&client_id=&cell_id=${cellID}-${version}&table_id=1&TableOptions=%7B%7D&Version=${timestamp}&start_row=${startRow}&rows=${toRow}&sort_direction=false`,
        {headers: header}
    ).then(response => {
        return response.json()
    }).then(data => {
        console.debug("Client Data:")
        console.debug(data)
        let clientIDs = []
        let keys = data.columns;
        let clientRows = []
        data.rows.forEach(row => {
            row = JSON.parse(row.json);
            let entry = {}
            for (i = 0; i < row.length; i++) {
                entry[keys[i]] = row[i];
            }
            clientRows.push(JSON.stringify(entry));
            console.debug(entry)
            clientIDs.push(entry["client_id"]);
        });
        // show loading spinner
        loadClientInfo(clientRows.join("\n"))
        caseData.clientIDs = clientIDs;
        // if there are more rows, load them
        if (data.total_rows > toRow) {
            loadFromClientInfoCell(notebookID, cellID, version, timestamp, startRow + toRow, toRow + 1000);
        }
    });

}


function getFromMonitoringArtifact() {
    // Notebook-ID-Start für das Monitoring-Artefakt
    let notebookIDStart = "N.E." + monitoringArtifact
    console.debug("checking for monitoring artifact data...")

    // Initialisiere die Überwachungsdaten, falls noch nicht vorhanden
    if (caseData.clientMonitoringLatestUpdate === undefined) {
        caseData.clientMonitoringLatestUpdate = {}
    }

    // Überprüfe, ob Client-IDs vorhanden sind
    if (caseData.clientIDs) {
        caseData.clientIDs.forEach(clientID => {
            console.debug("checking monitoring artifact for clientID: " + clientID)

            // Zeitstempel für letzte bekannte Daten (sonst 0)
            let latestUpdate = caseData.clientMonitoringLatestUpdate[clientID] || 0;

            // API-Call zum Abrufen neuer Monitoring-Daten für den Client
            fetch(velo_url + `/api/v1/GetTable?client_id=${clientID}&artifact=${monitoringArtifact}&type=CLIENT_EVENT&start_time=${latestUpdate}&end_time=9999999999&rows=10000`, {
                headers: header
            }).then(response => response.json()
            ).then(data => {
                console.debug("monitoring data for clientID: ")
                console.debug(data)

                // Wenn keine Daten vorhanden sind, abbrechen
                if (data.rows === undefined) {
                    return;
                }

                // Extrahiere relevante Daten
                let keys = data.columns;
                let rows = data.rows;
                let serverTimeIndex = data.columns.indexOf("_ts"); // Index für Zeitstempel
                let monitoringData = []
                let maxUpdatedTime = 0;

                // Iteriere über alle Zeilen
                rows.forEach(row => {
                    row = JSON.parse(row.json);
                    console.debug(`row time: ${row[serverTimeIndex]}, lastUpdatedTime: ${latestUpdate}`)

                    // Wenn der neue Zeitstempel größer ist als der bisherige
                    if (row[serverTimeIndex] > latestUpdate) {
                        if (row[serverTimeIndex] > maxUpdatedTime) {
                            console.debug("updating maxUpdatedTime to" + row[serverTimeIndex])
                            maxUpdatedTime = row[serverTimeIndex];
                        }

                        // Erstelle Eintrag aus Spalten
                        let entry = {}
                        keys.forEach((key, index) => {
                            entry[key] = row[index];
                        });

                        if (entry) {
                            console.debug(entry)
                            monitoringData.push(JSON.stringify(entry));
                        }
                    }
                });

                // Aktualisiere den Zeitstempel für zukünftige Aufrufe
                caseData.clientMonitoringLatestUpdate[clientID] = maxUpdatedTime;

                // Wenn neue Daten vorhanden sind: Verarbeite sie
                if (monitoringData.length > 0) {
                    console.debug("monitoring data for clientID: " + clientID + " is being processed with " + monitoringData.length + " entries")

                    // Lade Daten, dann speichere sie in der lokalen DB
                    processJSONUpload(monitoringData.join("\n")).then(() => {
                        console.debug("monitoring data processed");
                        storeDataToIndexDB(header["Grpc-Metadata-Orgid"]);
                    });
                }
            });
        });
    }
}


/**
 * Ersetzt einen bestehenden Button mit einem neuen Button,
 * der beim Klick die Client- und Hunt-Daten vom Velociraptor lädt.
 * 
 * @param {HTMLElement} replaceBtn - Container, der den alten Button enthält
 * @param {string} text - Anzeigetext des neuen Buttons
 * @param {string} ordID - Die Organisation-ID
 */
function changeBtn(replaceBtn, text, ordID) {
    let newBtn = document.createElement("button");

    // Kopiere CSS-Klassen des alten Buttons auf den neuen
    newBtn.className = replaceBtn.children[0].className;

    // Leere das alte Button-Container-Element
    replaceBtn.innerHTML = ""

    // Setze den Text des neuen Buttons
    newBtn.innerText = text;

    // Beim Klick wird die ClientInfo geladen und die Hunts abgerufen
    newBtn.addEventListener("click", evt => {
        evt.preventDefault()
        getClientInfoFromVelo();
        getHunts(ordID);
    });

    // Füge neuen Button ins DOM ein
    replaceBtn.appendChild(newBtn)
}


/**
 * Lädt lokal gespeicherte Daten (IndexedDB) für eine bestimmte Organisation.
 * 
 * @param {string} orgID - Die Organisation-ID
 */
function loadDataFromDB(orgID) {
    retrieveDataFromIndexDB(orgID); // ruft benutzerdefinierte Funktion auf
}


/**
 * Startet die periodische Synchronisierung der Monitoring-Daten
 * 
 * @returns {number} - Intervall-ID für späteres Stoppen
 */
function syncFromMonitoringArtifact() {
    // alle 60 Sekunden neue Daten vom Monitoring-Artefakt laden
    return setInterval(getFromMonitoringArtifact, 60000);
}


/**
 * Beendet die laufende Synchronisation anhand der Intervall-ID.
 * 
 * @param {number} id - Die ID des setInterval-Timers
 */
function stopMonitoringAync(id) {
    clearInterval(id);
}


/**
 * Erstellt einen Toggle-Button im UI zur Live-Synchronisierung von Daten.
 * Beim Aktivieren wird die Synchronisation gestartet,
 * beim Deaktivieren wieder gestoppt.
 */
function createSyncBtn() {
    let syncBtn = document.createElement("input");

    // Setze Typ und ID
    syncBtn.className = "form-check-input";
    syncBtn.type = "checkbox";
    syncBtn.id = "syncBtn";

    // Label für den Toggle-Switch
    let syncLabel = document.createElement("label");
    syncLabel.className = "form-check-label";
    syncLabel.innerText = "Life Data";
    syncLabel.setAttribute("for", "syncBtn");

    // Event-Listener zum Starten der Synchronisation
    syncBtn.addEventListener("click", evt => {
        let syncID = syncFromMonitoringArtifact();
        evt.target.innerText = "Stop";

        // Entferne alten Listener und registriere neuen zum Stoppen
        evt.target.removeEventListener("click", evt);
        evt.target.addEventListener("click", evt => {
            stopMonitoringAync(syncID);
            evt.target.innerText = "Life Data";
            evt.target.removeEventListener("click", evt);
            evt.target.addEventListener("click", evt);
        });
    });

    // Verpacke Switch in ein Wrapper-Element (Bootstrap-kompatibel)
    let wrapper = document.createElement("div");
    wrapper.className = "form-check form-switch ms-2";
    wrapper.appendChild(syncBtn);
    wrapper.appendChild(syncLabel);

    // Ersetze den bestehenden Case-Button durch den Sync-Toggle
    document.getElementById("casesBtnGrp").innerHTML = "";
    document.getElementById("casesBtnGrp").appendChild(wrapper);
}


/**
 * Hauptinitialisierungsfunktion, prüft ob die Seite mit Velociraptor verbunden ist.
 * Holt Org-ID, versteckt Upload-Button und zeigt stattdessen den Sync-Button.
 */
function checkForVelociraptor() {
    // Versuche die Benutzermerkmale vom Velociraptor zu laden
    fetch(velo_url + '/api/v1/GetUserUITraits', {headers: header}).then(response => {
        return response.json()
    }).then(data => {
        // Hole die Organisation-ID aus dem Rückgabewert
        let orgID = data.interface_traits.org || 'root';

        // Setze Header mit Organisation-ID
        header = {"Grpc-Metadata-Orgid": orgID}

        // Ersetze Upload-Button durch dynamischen "Load"-Button
        let replaceBtn = document.getElementById("dataBtnWrapper");
        changeBtn(replaceBtn, "Load " + orgID, orgID);

        // Lade evtl. bereits vorhandene Daten aus IndexedDB
        loadDataFromDB(orgID);

        // Zeige Sync-Button zur Überwachung in Echtzeit
        createSyncBtn()
    }).catch(error => {
        console.debug(error)
        console.debug("seems to be not connected to Velociraptor.");
    });
}
