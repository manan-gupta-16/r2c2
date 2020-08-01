import React from 'react'
import {Map as LeafletMap, TileLayer} from 'react-leaflet';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {
    faBan,
    faCrosshairs,
    faHome,
    faPlus,
    faQuestion,
    faSatellite,
    faSave,
    faTimes,
    faTrashAlt,
    faUndo,
    faWindowClose,
} from '@fortawesome/free-solid-svg-icons'
import {Button, ButtonGroup, ButtonToolbar, Card, Navbar, OverlayTrigger, Popover} from 'react-bootstrap';
import {css, StyleSheet} from 'aphrodite';

import {toast} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import fenceIcon from '../../assets/img/fence.svg';
import missionPtsIcon from '../../assets/img/missionPtsIcon.svg';
import pathIcon from '../../assets/img/path.svg';

import CoordSys from "../../assets/CoordSys";
import {FjageHelper} from "../../assets/fjageHelper";
import {Management} from "../../assets/jc2";

import ToolbarComponent from "../ToolbarComponent";

import MissionPlannerComponent from "./MissionPlannerComponent";
import MissionPlannerMapElement from "../map/missionPlanner/MissionPlannerMapElement";
import "../../assets/MissionPlanner.css";

import CoordSysContext from "../map/CoordSysContext";
import CursorPositionComponent from "../map/CursorPositionComponent";
import GeoFenceEditorMapElement from "../map/GeoFenceEditorMapElement";
import GeoFenceMapElement from "../map/GeoFenceMapElement";
import MissionMapElement from "../map/MissionMapElement";
import VehicleMapElement from "../map/VehicleMapElement";
import VehicleTrailMapElement from "../map/VehicleTrailMapElement";

console.log('process.env.REACT_APP_MAP_TILE_URL', process.env.REACT_APP_MAP_TILE_URL);

toast.configure();

const tileUrl = process.env.REACT_APP_MAP_TILE_URL
    ? process.env.REACT_APP_MAP_TILE_URL
    : process.env.PUBLIC_URL + '/osm/tiles/{z}/{x}/{y}.png';

const styles = StyleSheet.create({
    toolbar: {
        position: "fixed",
        zIndex: 1000,
        top: "1rem",
        left: "64px",
    },
    geofenceEditor: {
        position: "fixed",
        zIndex: 1000,
        top: "4rem",
        left: "64px",
    },
    missionPlannerContainer: {
        position: "fixed",
        zIndex: 1000,
        top: "5rem",
        left: "10px",
        width: "300px",
        height: "50%",
        fontSize: "0.9em",
        backgroundColor: "white",
        display: "flex",
        flexFlow: "column",
    },
    missionPlanner: {
        overflowY: "auto",
    },
});

const MODE_NONE = 0;
const MODE_GEOFENCE_EDITOR = 1;
const MODE_MISSION_PLANNER = 2;

const TOAST_AUTOCLOSE = {
    position: toast.POSITION.BOTTOM_RIGHT,
    autoClose: true,
};

const TOAST_NO_AUTOCLOSE = {
    position: toast.POSITION.BOTTOM_RIGHT,
    autoClose: false,
};

const geofenceEditorPopover = (
    <Popover id="popover-basic">
        <Popover.Title as="h3">Help</Popover.Title>
        <Popover.Content>
            <h6>Adding a point</h6>
            <p>
                Right-click on the map to add a point.
            </p>
            <h6>Deleting a point</h6>
            <p>
                Left-click on a point to bring up a menu and click on the delete button.
            </p>
        </Popover.Content>
    </Popover>
);

class MapComponent
    extends React.Component {

    constructor(props, context) {
        super(props, context);

        this.gateway = FjageHelper.getGateway();

        this.state = {
            mode: MODE_NONE,

            mapCenter: [1.3521, 103.8198],
            mapZoom: 12,

            origin: null,
            coordSys: null,

            cursorPosition: null,

            vehiclePositionLocal: null,
            vehicleErrorRadius: 60,
            vehicleReady: false,

            geoFence: null,

            missionDefinitions: null,
            mission: null,

            displayVehicle: true,
            displayVehiclePath: true,
            displayGeoFence: true,
            displayMission: true,

            missionPlannerMissionDefinitions: null,
            missionPlannerSelectedMissionIndex: -1,
            missionPlannerSelectedMission: null,
            missionPlannerSelectedTaskIndex: -1,
            missionPlannerSelectedTask: null,
        };

        this.vehicleId = null;

        this.mapRef = React.createRef();
        this.vehicleTrailRef = React.createRef();
        this.geoFenceEditorRef = React.createRef();
        this.missionPlannerRef = React.createRef();
    }

    componentDidMount() {
        this.gateway.addConnListener((connected) => {
            if (connected) {
                this.gateway.subscribe(this.gateway.topic('org.arl.jc2.enums.C2Topics.VEHICLESTATUS'));
                this.gateway.subscribe(this.gateway.topic('org.arl.jc2.enums.C2Topics.MISSIONSTATUS'));
                this.gateway.addMessageListener((msg) => {
                    if (msg.__clazz__ === 'org.arl.jc2.messages.VehicleStatus') {
                        this._updateVehiclePosition({
                            x: msg.pos.x,
                            y: msg.pos.y,
                        });
                    } else if (msg.__clazz__ === 'org.arl.jc2.messages.MissionStatusNtf') {
                        console.log(msg);
                    }
                });

                this.management = new Management(this.gateway);

                this.management.getOrigin()
                    .then(response => {
                        this._updateOrigin({
                            latitude: response.latitude,
                            longitude: response.longitude
                        });
                    })
                    .catch(reason => {
                        console.log('could not get origin', reason);
                        toast.error("FATAL: Could not get origin!", TOAST_AUTOCLOSE);
                    });

                this.management.getVehicleId()
                    .then(vehicleId => {
                        console.log('vehicleId', vehicleId);
                        this.vehicleId = vehicleId;
                        document.title = vehicleId + " StarControl";
                    })
                    .catch(reason => {
                        console.log('could not get vehicle ID', reason);
                        toast.error("FATAL: Could not get vehicle ID!", TOAST_AUTOCLOSE);
                    });

                this.management.getGeofence()
                    .then(response => {
                        this._updateGeoFence(response);
                    })
                    .catch(reason => {
                        console.log('could not get geofence', reason);
                        toast.error("FATAL: Could not get geofence!", TOAST_AUTOCLOSE);
                    });

                this.management.getMissions()
                    .then(missionDefinitions => {
                        this._updateMissionDefinitions(missionDefinitions);
                    })
                    .catch(reason => {
                        console.log('could not get missions', reason);
                        toast.error("FATAL: Could not get missions!", TOAST_AUTOCLOSE);
                    });

                this.management.getMeasurement("Position", 4, 1.0)
                    .then(measurement => {
                        let xPosErr = NaN;
                        let yPosErr = NaN;
                        measurement.items.forEach(item => {
                            if (item.type === 'MQ_XPOS_ERR') {
                                xPosErr = parseFloat(item.value);
                            } else if (item.type === 'MQ_YPOS_ERR') {
                                yPosErr = parseFloat(item.value);
                            }
                        });
                        if (!isNaN(xPosErr) && !isNaN(yPosErr)) {
                            const vehicleErrorRadius = (xPosErr + yPosErr) / 2;
                            this.setState({
                                vehicleErrorRadius: vehicleErrorRadius,
                            });
                        }
                    })
                    .catch(reason => {
                        console.log('could not get measurement', reason);
                    });
            }
        });

        this._setVehicleNotReady();
        // Simulate vehicle readiness UI
        setTimeout(() => this._setVehicleReady(), 5000);

        // Simulate map position accuracy UI
        setInterval(
            () => {
                if (this.state.vehicleErrorRadius > 30) {
                    this.setState({
                        vehicleErrorRadius: this.state.vehicleErrorRadius - 1,
                    });
                }
            },
            200);
    }

    componentWillUnmount() {
        this.gateway.close();
    }

    render() {
        const inNormalMode = (this.state.mode === MODE_NONE);
        const inGeofenceEditor = (this.state.mode === MODE_GEOFENCE_EDITOR);
        const inMissionPlanner = (this.state.mode === MODE_MISSION_PLANNER);

        return (
            <CoordSysContext.Provider value={this.state.coordSys}>
                <LeafletMap ref={this.mapRef}
                            center={this.state.mapCenter}
                            zoom={this.state.mapZoom}
                            onContextMenu={this._onMapRightClick}
                            onMouseMove={this._onMapMouseMove}>
                    <TileLayer
                        attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
                        url={tileUrl}
                        minZoom={1}
                        maxZoom={17}
                    />

                    {(inNormalMode || inMissionPlanner) && this.state.displayGeoFence && (
                        <GeoFenceMapElement id="geofence"
                                            points={this.state.geoFence}
                                            color="red"/>
                    )}

                    {inGeofenceEditor && (
                        <GeoFenceEditorMapElement id="geofenceEditor"
                                                  ref={this.geoFenceEditorRef}
                                                  points={this.state.geoFence}
                                                  color="blue"/>
                    )}

                    {inNormalMode && this.state.displayMission && this.state.mission && (
                        <MissionMapElement id="mission"
                                           mission={this.state.mission}
                                           color="green"/>
                    )}

                    <VehicleTrailMapElement id="vehicleTrail"
                                            ref={this.vehicleTrailRef}
                                            hidden={(!inNormalMode && !inMissionPlanner) || !this.state.displayVehiclePath}
                                            color="yellow"
                                            maxSize={1000}/>

                    {this.state.displayVehicle && (
                        <VehicleMapElement id="vehicle"
                                           point={this.state.vehiclePositionLocal}
                                           errorRadius={this.state.vehicleErrorRadius}
                                           ready={this.state.vehicleReady}/>
                    )}

                    {inMissionPlanner && (
                        <MissionPlannerMapElement id="missionPlanner"
                                                  mission={this.state.missionPlannerSelectedMission}
                                                  selectedTaskIndex={this.state.missionPlannerSelectedTaskIndex}
                                                  coordSys={this.state.coordSys}
                                                  color="black"
                                                  onTaskSelected={this._onMissionPlannerTaskSelected}
                                                  onTaskMoved={this._onMissionPlannerTaskMoved}/>
                    )}
                </LeafletMap>

                <div className={css(styles.toolbar)}>
                    <ButtonToolbar>
                        <ButtonGroup className="map-button-group">
                            <ToolbarComponent onClick={this._openNewWindow}/>
                            <Button onClick={this._onCloseAllChildWindows}>
                                <FontAwesomeIcon icon={faWindowClose} title="Close all child windows"/>
                            </Button>
                        </ButtonGroup>

                        <ButtonGroup className="map-button-group">
                            <div className="dropdown_styles">
                                <Button>Missions</Button>
                                <div className="dropdown_content">
                                    {this.state.missionDefinitions && this.state.missionDefinitions.missions.map((mission, index) => {
                                        return (
                                            <div key={index}>
                                                #{index + 1}
                                                &nbsp;
                                                <Button onClick={(e) => this._onViewMission(mission, index)}>
                                                    View
                                                </Button>
                                                &nbsp;
                                                <Button onClick={(e) => this._onRunMission(mission, index)}
                                                        disabled={!inNormalMode}>
                                                    Run
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </ButtonGroup>

                        <ButtonGroup className="map-button-group">
                            <Button onClick={this._onRecentreMap}>
                                <FontAwesomeIcon icon={faCrosshairs} title="Re-center map"/>
                            </Button>
                            <Button active={this.state.displayGeoFence}
                                    onClick={this._onToggleGeoFence}>
                                <img title="Toggle geofence" src={fenceIcon} height={20} width={20}
                                     alt="Toggle geofence"/>
                            </Button>
                            <Button active={this.state.displayMission}
                                    onClick={this._onToggleMission}>
                                <img title="Toggle mission points" src={missionPtsIcon} height={25} width={25}
                                     alt="Toggle mission points"/>
                            </Button>
                            <Button active={this.state.displayVehiclePath}
                                    onClick={this._onToggleVehiclePath}>
                                <img title="Toggle vehicle path" src={pathIcon} height={20} width={20}
                                     alt="Toggle vehicle path"/>
                            </Button>
                        </ButtonGroup>

                        {inNormalMode && (
                            <ButtonGroup className="map-button-group">
                                <Button onClick={this._onAbortMission}>
                                    <FontAwesomeIcon icon={faBan} title="Abort mission"/>
                                </Button>
                                <Button onClick={this._onStationKeep}>
                                    <FontAwesomeIcon icon={faSatellite} title="Station-keep"/>
                                </Button>
                                <Button onClick={this._onGoHome}>
                                    <FontAwesomeIcon icon={faHome} title="Go home"/>
                                </Button>
                            </ButtonGroup>
                        )}

                        {inNormalMode && (
                            <ButtonGroup className="map-button-group">
                                <Button onClick={this._onToggleGeofenceEditor}>
                                    Edit geofence
                                </Button>
                            </ButtonGroup>
                        )}

                        {inNormalMode && (
                            <ButtonGroup className="map-button-group">
                                <Button active={inMissionPlanner}
                                        onClick={this._onToggleMissionPlanner}>
                                    Mission Planner
                                </Button>
                            </ButtonGroup>
                        )}
                    </ButtonToolbar>
                </div>

                {inGeofenceEditor && (
                    <div className={css(styles.geofenceEditor)}>
                        <Navbar bg="light" size="sm">
                            <Navbar.Brand>Geofence Editor</Navbar.Brand>
                            <Navbar.Collapse className="justify-content-end">
                                <Button className="ml-1"
                                        onClick={this._onGeoFenceEditorCancel}>
                                    <FontAwesomeIcon icon={faTimes} title="Close"/>
                                </Button>
                            </Navbar.Collapse>
                        </Navbar>
                        <Card>
                            <Card.Body>
                                <ButtonToolbar>
                                    <ButtonGroup className="mr-1">
                                        <Button onClick={this._onGeoFenceEditorUndo}>
                                            <FontAwesomeIcon icon={faUndo} color="#fff" title="Undo"/>
                                        </Button>
                                        <Button onClick={this._onGeoFenceEditorClear}>
                                            <FontAwesomeIcon icon={faTrashAlt} color="#fff" title="Clear"/>
                                        </Button>
                                    </ButtonGroup>
                                    <ButtonGroup className="mr-1">
                                        <Button onClick={this._onGeoFenceEditorSave}>
                                            <FontAwesomeIcon icon={faSave} color="#fff" title="Save and exit"/>
                                        </Button>
                                    </ButtonGroup>
                                    <ButtonGroup>
                                        <OverlayTrigger trigger="click"
                                                        placement="right"
                                                        overlay={geofenceEditorPopover}>
                                            <Button>
                                                <FontAwesomeIcon icon={faQuestion} color="#fff" title="Help"/>
                                            </Button>
                                        </OverlayTrigger>
                                    </ButtonGroup>
                                </ButtonToolbar>
                            </Card.Body>
                        </Card>
                    </div>
                )}

                {inMissionPlanner && (
                    <div className={css(styles.missionPlannerContainer)}>
                        <Navbar bg="light">
                            <Navbar.Brand>Mission Planner</Navbar.Brand>
                            <Navbar.Collapse className="justify-content-end">
                                <Button className="ml-1"
                                        onClick={this._onMissionPlannerNewMission}>
                                    <FontAwesomeIcon icon={faPlus} title="New mission"/>
                                </Button>
                                <Button className="ml-1"
                                        onClick={this._onToggleMissionPlanner}>
                                    <FontAwesomeIcon icon={faTimes} title="Close"/>
                                </Button>
                            </Navbar.Collapse>
                        </Navbar>
                        <div className={css(styles.missionPlanner)}>
                            <MissionPlannerComponent ref={this.missionPlannerRef}

                                                     missionDefinitions={this.state.missionPlannerMissionDefinitions}
                                                     selectedMissionIndex={this.state.missionPlannerSelectedMissionIndex}
                                                     selectedTaskIndex={this.state.missionPlannerSelectedTaskIndex}

                                                     onMissionSelected={this._onMissionPlannerMissionSelected}
                                                     onTaskSelected={this._onMissionPlannerTaskSelected}
                                                     onTaskChanged={this._onMissionPlannerTaskChanged}
                                                     onRevertMissionRequested={this._onMissionPlannerRevertMissionRequested}
                                                     onSaveMissionRequested={this._onMissionPlannerSaveMissionRequested}
                                                     onDeleteMissionRequested={this._onMissionPlannerDeleteMissionRequested}/>
                        </div>
                    </div>
                )}

                <CursorPositionComponent position={this.state.cursorPosition}/>
            </CoordSysContext.Provider>
        );
    }

    // ----

    _updateOrigin(origin) {
        const coordSys = new CoordSys(origin.latitude, origin.longitude);
        this.setState({
            origin: origin,
            coordSys: coordSys,
            mapCenter: [origin.latitude, origin.longitude],
        }, () => this._fitMapToBounds());
    }

    _updateGeoFence(geoFence) {
        this.setState({
            geoFence: geoFence,
        }, () => this._fitMapToBounds());
    }

    _updateMissionDefinitions(missionDefinitions) {
        this.setState({
            missionDefinitions: missionDefinitions,
        });
    }

    _updateVehiclePosition(point) {
        this.setState({
            vehiclePositionLocal: point,
        });
        if (this.vehicleTrailRef.current) {
            this.vehicleTrailRef.current.addPoint(point);
        }
    }

    _fitMapToBounds() {
        if (!this.state.coordSys) {
            return;
        }
        const points = [];
        if (this.state.geoFence) {
            const localBounds = this._getBounds(this.state.geoFence.map(point => [point.x, point.y]));
            if (localBounds) {
                points.push(...localBounds);
            }
        }
        if (this.state.vehiclePositionLocal) {
            points.push([this.state.vehiclePositionLocal.x, this.state.vehiclePositionLocal.y]);
        }
        if (points.length > 1) {
            const localBounds = this._getBounds(points);
            const globalBounds = [
                [
                    this.state.coordSys.locy2lat(localBounds[0][1]),
                    this.state.coordSys.locx2long(localBounds[0][0]),
                ],
                [
                    this.state.coordSys.locy2lat(localBounds[1][1]),
                    this.state.coordSys.locx2long(localBounds[1][0]),
                ],
            ];
            if (this.mapRef.current) {
                this.mapRef.current.leafletElement.fitBounds(globalBounds);
            }
        }
    }

    // ---- map event handlers

    _onMapMouseMove = function (e) {
        this.setState({
            cursorPosition: {
                latitude: e.latlng.lat,
                longitude: e.latlng.lng,
            },
        });
    }.bind(this);

    _onMapRightClick = function (e) {
        if (this.state.mode === MODE_MISSION_PLANNER) {
            if (this.missionPlannerRef.current) {
                this.missionPlannerRef.current.handleEvent(e);
            }
        } else if (this.state.mode === MODE_GEOFENCE_EDITOR) {
            if (this.geoFenceEditorRef.current) {
                this.geoFenceEditorRef.current.handleEvent(e);
            }
        }
    }.bind(this);

    // ---- map control event handlers

    _onRecentreMap = function (e) {
        this._fitMapToBounds();
    }.bind(this);

    _onToggleGeoFence = function (e) {
        this.setState({
            displayGeoFence: !this.state.displayGeoFence,
        });
    }.bind(this);

    _onToggleMission = function (e) {
        this.setState({
            displayMission: !this.state.displayMission,
        });
    }.bind(this);

    _onToggleVehiclePath = function (e) {
        this.setState({
            displayVehiclePath: !this.state.displayVehiclePath,
        });
    }.bind(this);

    // ---- mission viewer/runner event handlers

    _onViewMission(mission, index) {
        this.setState({
            displayMission: true,
            mission: mission,
        });
    }

    _onRunMission(mission, index) {
        // TODO Handle edited missions
        this._onViewMission(mission, index);
        this.management.runMission(index + 1);
        // TODO Currently there is no response from JC2
        toast.info("Run mission #" + (index + 1) + " requested.", TOAST_AUTOCLOSE);
    }

    // ---- geofence editor event handlers

    _onToggleGeofenceEditor = function (e) {
        this.setState({
            mode: (this.state.mode !== MODE_GEOFENCE_EDITOR) ? MODE_GEOFENCE_EDITOR : MODE_NONE,
        })
    }.bind(this);

    _onGeoFenceEditorUndo = function (e) {
        if (this.geoFenceEditorRef.current) {
            this.geoFenceEditorRef.current.undo();
        }
    }.bind(this);

    _onGeoFenceEditorClear = function (e) {
        if (this.geoFenceEditorRef.current) {
            this.geoFenceEditorRef.current.clear();
        }
    }.bind(this);

    _onGeoFenceEditorSave = function (e) {
        if (!this.geoFenceEditorRef.current) {
            return;
        }
        const geoFence = this.geoFenceEditorRef.current.getPoints();
        this.management.updateGeofence(geoFence)
            .then(response => {
                this.setState({
                    mode: MODE_NONE,
                    geoFence: geoFence,
                });
                toast.success("Geofence updated!", TOAST_AUTOCLOSE);
            })
            .catch(reason => {
                console.log('Could not update geofence ', reason);
                toast.error("FATAL: Could not update geofence!", TOAST_AUTOCLOSE);
            });
    }.bind(this);

    _onGeoFenceEditorCancel = function (e) {
        this.setState({
            mode: MODE_NONE,
        });
    }.bind(this);

    // ---- window management callbacks

    _openNewWindow = function (item) {
        const href = window.location.href;
        const url = href.substring(0, href.lastIndexOf('/') + 1) + item;
        const w = window.open(url, item,
            "width=600,height=600,menubar=0,toolbar=0,location=0,personalBar=0,status=0,resizable=1");
        if (w) {
            w.focus();
        }
    }.bind(this);

    // ---- window management event handlers

    _onCloseAllChildWindows = function (e) {
        const windowsArr = ["Dashboard", "Diagnostics", "Sentuators", "ScriptControl"];
        windowsArr.forEach((tab) => {
            const href = window.location.href;
            const url = href.substring(0, href.lastIndexOf('/') + 1) + tab;
            const w = window.open(url, tab,
                "width=600,height=600,menubar=0,toolbar=0,location=0,personalBar=0,status=0,resizable=1");
            if (w) {
                w.close();
            }
        });
    }.bind(this);

    // ---- operator commands event handlers

    _onAbortMission = function (e) {
        console.log("Abort Mission!");
        this.management.abortMission();
        // TODO Currently there is no response from JC2
        toast.info("Abort mission requested.", TOAST_AUTOCLOSE);
    }.bind(this);

    _onStationKeep = function (e) {
        console.log("Station Keep!");
        this.management.stationKeep();
        // TODO Currently there is no response from JC2
        toast.info("Station keep requested.", TOAST_AUTOCLOSE);
    }.bind(this);

    _onGoHome = function (e) {
        console.log("Go Home!");
        this.management.abortToHome();
        // TODO Currently there is no response from JC2
        toast.info("Abort to home requested.", TOAST_AUTOCLOSE);
    }.bind(this);

    // ---- mission planner event handlers

    _onToggleMissionPlanner = function (e) {
        const newMode = (this.state.mode !== MODE_MISSION_PLANNER) ? MODE_MISSION_PLANNER : MODE_NONE;
        const inMissionPlanner = (newMode === MODE_MISSION_PLANNER);

        this.setState({
            mode: newMode,

            missionPlannerMissionDefinitions: inMissionPlanner
                ? this._clone(this.state.missionDefinitions)
                : null,

            missionPlannerSelectedMissionIndex: -1,
            missionPlannerSelectedMission: null,
            missionPlannerSelectedTaskIndex: -1,
            missionPlannerSelectedTask: null,
        });
    }.bind(this);

    _onMissionPlannerNewMission = function (e) {
        const missionDefinitions = this.state.missionPlannerMissionDefinitions;
        const newMissionIndex = missionDefinitions.missions.length;
        const newMission = {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            tasks: [],
        };
        missionDefinitions.missions.push(newMission);
        this.setState({
            missionPlannerMissionDefinitions: {...missionDefinitions},

            missionPlannerSelectedMissionIndex: newMissionIndex,
            missionPlannerSelectedMission: newMission,
            missionPlannerSelectedTaskIndex: -1,
            missionPlannerSelectedTask: null,
        });
    }.bind(this);

    // ---- mission planner callbacks

    _onMissionPlannerMissionSelected = function (index) {
        this.setState({
            missionPlannerSelectedMissionIndex: index,
            missionPlannerSelectedMission:
                (index >= 0) && (index < this.state.missionPlannerMissionDefinitions.missions.length)
                    ? this.state.missionPlannerMissionDefinitions.missions[index]
                    : null,
            missionPlannerSelectedTaskIndex: -1,
            missionPlannerSelectedTask: null,
        });
    }.bind(this);

    _onMissionPlannerTaskSelected = function (index) {
        const mission = this.state.missionPlannerSelectedMission;
        if (!mission) {
            return;
        }
        const task = (index >= 0) && (index < mission.tasks.length) ? mission.tasks[index] : null;
        this.setState({
            missionPlannerSelectedTaskIndex: index,
            missionPlannerSelectedTask: task,
        })
    }.bind(this);

    _onMissionPlannerTaskMoved = function (index, newPoint) {
        const mission = this.state.missionPlannerSelectedMission;
        if (!mission) {
            return;
        }
        if ((index < 0) || (index >= mission.tasks.length)) {
            return;
        }
        const task = mission.tasks[index];
        if (!task) {
            return;
        }
        task.position = newPoint;
        this._updateMissionPlannerTask(index, task);
    }.bind(this);

    _onMissionPlannerTaskChanged = function (task) {
        const mission = this.state.missionPlannerSelectedMission;
        if (!mission) {
            return;
        }
        const selectedTaskIndex = this.state.missionPlannerSelectedTaskIndex;
        if ((selectedTaskIndex < 0) || (selectedTaskIndex >= mission.tasks.length)) {
            return;
        }
        this._updateMissionPlannerTask(selectedTaskIndex, task);
    }.bind(this);

    _updateMissionPlannerTask(index, task) {
        const mission = this.state.missionPlannerSelectedMission;
        mission.updatedAt = Date.now();
        mission.tasks[index] = {...task};
        mission.tasks = [...mission.tasks];

        const updatedMission = {...mission};

        const missionDefinitions = this.state.missionPlannerMissionDefinitions;
        missionDefinitions.missions[this.state.missionPlannerSelectedMissionIndex] = updatedMission;

        this.setState({
            missionPlannerMissionDefinitions: {...this.state.missionPlannerMissionDefinitions},
            missionPlannerSelectedMission: updatedMission,
        });
    }

    _onMissionPlannerRevertMissionRequested = function (index) {
        const missionDefinitions = this.state.missionDefinitions;
        const missionPlannerMissionDefinitions = this.state.missionPlannerMissionDefinitions;
        if ((index < 0)
            || (index >= missionPlannerMissionDefinitions.missions.length)
            || (index >= missionDefinitions.missions.length)) {
            return false;
        }

        const clonedMission = this._clone(missionDefinitions.missions[index]);
        missionPlannerMissionDefinitions.missions[index] = clonedMission;
        missionPlannerMissionDefinitions.missions = [...missionPlannerMissionDefinitions.missions];
        this.setState({
            missionPlannerMissionDefinitions: {...missionPlannerMissionDefinitions},
            missionPlannerSelectedMission: clonedMission,
            missionPlannerSelectedTaskIndex: -1,
            missionPlannerSelectedTask: null,
        });
        return true;
    }.bind(this);

    _onMissionPlannerSaveMissionRequested = function (index, mission) {
        const missionPlannerMissionDefinitions = this.state.missionPlannerMissionDefinitions;
        if ((index < 0)
            || (index >= missionPlannerMissionDefinitions.missions.length)) {
            return false;
        }
        this.management.updateMission(mission, index)
            .then(response => {
                console.log(response);

                const updatedMission = {...mission};
                delete (updatedMission.updatedAt);

                const missionDefinitions = this.state.missionDefinitions;
                if (index < missionDefinitions.missions.length) {
                    missionDefinitions.missions[index] = updatedMission;
                } else {
                    while (missionDefinitions.missions.length < index) {
                        missionDefinitions.missions.push(updatedMission);
                    }
                }
                missionDefinitions.missions = [...missionDefinitions.missions];
                missionPlannerMissionDefinitions.missions[index] = updatedMission;
                missionPlannerMissionDefinitions.missions = [...missionPlannerMissionDefinitions.missions];

                this.setState({
                    missionDefinitions: {...missionDefinitions},

                    missionPlannerMissionDefinitions: {...missionPlannerMissionDefinitions},

                    missionPlannerSelectedMission: updatedMission,
                });

                toast.success('Changes to mission #' + (index + 1) + ' saved.', TOAST_AUTOCLOSE);
            })
            .catch(reason => {
                console.log('Error: could not save mission', reason);
                toast.error('Failed to save changes to mission #' + (index + 1) + '.', TOAST_AUTOCLOSE);
            });
    }.bind(this);

    _onMissionPlannerDeleteMissionRequested = function (index) {
        const missionDefinitions = this.state.missionDefinitions;
        const missionPlannerMissionDefinitions = this.state.missionPlannerMissionDefinitions;
        if (index < missionDefinitions.missions.length) {
            this.management.deleteMission(index)
                .then(response => {
                    console.log(response);

                    missionDefinitions.missions.splice(index, 1);
                    missionDefinitions.missions = [...missionDefinitions.missions];

                    missionPlannerMissionDefinitions.missions.splice(index, 1);
                    missionPlannerMissionDefinitions.missions = [...missionPlannerMissionDefinitions.missions];

                    this.setState({
                        missionDefinitions: {...missionDefinitions},
                        missionPlannerMissionDefinitions: {...missionPlannerMissionDefinitions},

                        missionPlannerSelectedMissionIndex: -1,
                        missionPlannerSelectedMission: null,
                        missionPlannerSelectedTaskIndex: -1,
                        missionPlannerSelectedTask: null,
                    });

                    toast.success('Mission #' + (index + 1) + ' deleted.', TOAST_AUTOCLOSE);
                })
                .catch(reason => {
                    console.log('Error: could not delete mission', reason);
                    toast.error('Failed to delete mission #' + (index + 1) + '.');
                });
        } else {
            missionPlannerMissionDefinitions.missions.splice(index, 1);
            missionPlannerMissionDefinitions.missions = [...missionPlannerMissionDefinitions.missions];

            this.setState({
                missionPlannerMissionDefinitions: {...missionPlannerMissionDefinitions},

                missionPlannerSelectedMissionIndex: -1,
                missionPlannerSelectedMission: null,
                missionPlannerSelectedTaskIndex: -1,
                missionPlannerSelectedTask: null,
            });

            toast.success('Mission #' + (index + 1) + ' deleted.', TOAST_AUTOCLOSE);
        }

        /*
        const missions = this.state.missions;
        const mission = this.state.missions[index];
        if (mission.createdAt) {
            missions.splice(index, 1);
            this.setState({
                missions: [...missions],
            });
            this.context.mission = null;
            this.context.missionIndex = -1;
            this.context.task = null;
            this.context.taskIndex = -1;
        } else {
            this.props.management.deleteMission(index)
                .then(response => {
                    console.log(response);
                    toast.success('Mission #' + (index + 1) + ' deleted.');

                    missions.splice(index, 1);
                    this.setState({
                        missions: [...missions],
                    });
                    this.context.mission = null;
                    this.context.missionIndex = -1;
                    this.context.task = null;
                    this.context.taskIndex = -1;

                    if (this.props.onMissionDeleted) {
                        this.props.onMissionDeleted(index);
                    }
                })
                .catch(reason => {
                    console.log('Error: could not delete mission', reason);
                    toast.error('Failed to delete mission #' + (index + 1) + '.');
                });
        }
         */
    }.bind(this);

    // ---- vehicle status ----

    _setVehicleReady() {
        if (this.vehicleStatusToastId) {
            toast.dismiss(this.vehicleStatusToastId);
            this.vehicleStatusToastId = null;
        }
        this.vehicleStatusToastId = toast.success("Vehicle is ready!", TOAST_NO_AUTOCLOSE);
        this.setState({
            vehicleReady: true,
        });
    }

    _setVehicleNotReady() {
        if (this.vehicleStatusToastId) {
            toast.dismiss(this.vehicleStatusToastId);
            this.vehicleStatusToastId = null;
        }
        this.vehicleStatusToastId = toast.error("Vehicle is not ready!", TOAST_NO_AUTOCLOSE);
        this.setState({
            vehicleReady: false,
        });
    }

    // ----

    _getBounds(points) {
        if (!points || (points.length === 0)) {
            return null;
        }
        const defaultPoint = [];
        for (let j = 0; j < 2; j++) {
            defaultPoint.push(points[0][j]);
        }
        const minArray = [...defaultPoint];
        const maxArray = [...defaultPoint];
        for (let i = 1; i < points.length; i++) {
            const point = points[i];
            for (let j = 0; j < 2; j++) {
                const value = point[j];
                if (value < minArray[j]) {
                    minArray[j] = value;
                } else if (value > maxArray[j]) {
                    maxArray[j] = value;
                }
            }
        }
        return [minArray, maxArray];
    }

    _clone(o) {
        return JSON.parse(JSON.stringify(o));
    }
}

export default MapComponent;
