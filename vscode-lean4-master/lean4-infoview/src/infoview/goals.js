"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilteredGoals = exports.Goal = void 0;
exports.goalsToString = goalsToString;
const infoview_api_1 = require("@leanprover/infoview-api");
const React = require("react");
const collapsing_1 = require("./collapsing");
const contexts_1 = require("./contexts");
const goalLocation_1 = require("./goalLocation");
const hoverHighlight_1 = require("./hoverHighlight");
const interactiveCode_1 = require("./interactiveCode");
const tooltips_1 = require("./tooltips");
const util_1 = require("./util");
/** Returns true if `h` is inaccessible according to Lean's default name rendering. */
function isInaccessibleName(h) {
    return h.indexOf('✝') >= 0;
}
function goalToString(g) {
    let ret = '';
    if (g.userName) {
        ret += `case ${g.userName}\n`;
    }
    for (const h of g.hyps) {
        const names = (0, infoview_api_1.InteractiveHypothesisBundle_nonAnonymousNames)(h).join(' ');
        ret += `${names} : ${(0, infoview_api_1.TaggedText_stripTags)(h.type)}`;
        if (h.val) {
            ret += ` := ${(0, infoview_api_1.TaggedText_stripTags)(h.val)}`;
        }
        ret += '\n';
    }
    ret += `⊢ ${(0, infoview_api_1.TaggedText_stripTags)(g.type)}`;
    return ret;
}
function goalsToString(goals) {
    return goals.goals.map(goalToString).join('\n\n');
}
function goalSettingsStateOfConfig(config) {
    return {
        reverse: config.reverseTacticState,
        hideGoalNames: !config.showGoalNames,
        emphasizeFirstGoal: config.emphasizeFirstGoal,
        showType: !config.hideTypeAssumptions,
        showInstance: !config.hideInstanceAssumptions,
        showHiddenAssumption: !config.hideInaccessibleAssumptions,
        showLetValue: !config.hideLetValues,
    };
}
function getFilteredHypotheses(hyps, settings) {
    return hyps.reduce((acc, h) => {
        if (h.isInstance && !settings.showInstance)
            return acc;
        if (h.isType && !settings.showType)
            return acc;
        const names = settings.showHiddenAssumption ? h.names : h.names.filter(n => !isInaccessibleName(n));
        const hNew = settings.showLetValue
            ? { ...h, names }
            : { ...h, names, val: undefined };
        if (names.length !== 0)
            acc.push(hNew);
        return acc;
    }, []);
}
function HypName({ name, isInserted, isRemoved, mvarId, fvarId }) {
    const ref = React.useRef(null);
    const locs = React.useContext(goalLocation_1.LocationsContext);
    const hhl = (0, hoverHighlight_1.useHoverHighlight)({
        ref,
        highlightOnHover: locs !== undefined && mvarId !== undefined && fvarId !== undefined,
        underlineOnModHover: false,
    });
    let selectableLocationSettings;
    if (mvarId !== undefined && fvarId !== undefined) {
        selectableLocationSettings = { isSelectable: true, loc: { mvarId, loc: { hyp: fvarId } } };
    }
    else {
        selectableLocationSettings = { isSelectable: false };
    }
    const sl = (0, goalLocation_1.useSelectableLocation)(selectableLocationSettings);
    const namecls = (isInserted ? 'inserted-text ' : '') +
        (isRemoved ? 'removed-text ' : '') +
        (isInaccessibleName(name) ? 'goal-inaccessible ' : '') +
        hhl.className +
        sl.className;
    return (<>
            <span ref={ref} className={namecls} data-vscode-context={JSON.stringify(sl.dataVscodeContext)} onPointerOver={e => hhl.onPointerOver(e)} onPointerOut={e => hhl.onPointerOut(e)} onPointerMove={e => hhl.onPointerMove(e)} onClick={e => sl.onClick(e)} onPointerDown={e => sl.onPointerDown(e)}>
                {name}
            </span>
            &nbsp;
        </>);
}
function Hyp({ hyp: h, mvarId }) {
    const locs = React.useContext(goalLocation_1.LocationsContext);
    const names = (0, infoview_api_1.InteractiveHypothesisBundle_nonAnonymousNames)(h).map((n, i) => (<HypName name={n} isInserted={!!h.isInserted} isRemoved={!!h.isRemoved} mvarId={mvarId} fvarId={h.fvarIds?.at(i)} key={i}></HypName>));
    const typeLocs = React.useMemo(() => locs && mvarId && h.fvarIds && h.fvarIds.length > 0
        ? { ...locs, subexprTemplate: { mvarId, loc: { hypType: [h.fvarIds[0], ''] } } }
        : undefined, [locs, mvarId, h.fvarIds]);
    const valLocs = React.useMemo(() => h.val && locs && mvarId && h.fvarIds && h.fvarIds.length > 0
        ? { ...locs, subexprTemplate: { mvarId, loc: { hypValue: [h.fvarIds[0], ''] } } }
        : undefined, [h.val, locs, mvarId, h.fvarIds]);
    return (<div>
            <strong className="goal-hyp">{names}</strong>
            :&nbsp;
            <goalLocation_1.LocationsContext.Provider value={typeLocs}>
                <interactiveCode_1.InteractiveCode fmt={h.type}/>
            </goalLocation_1.LocationsContext.Provider>
            {h.val && (<goalLocation_1.LocationsContext.Provider value={valLocs}>
                    &nbsp;:=&nbsp;
                    <interactiveCode_1.InteractiveCode fmt={h.val}/>
                </goalLocation_1.LocationsContext.Provider>)}
        </div>);
}
/**
 * Displays the hypotheses, target type and optional case label of a goal according to the
 * provided `filter`. */
exports.Goal = React.memo((props) => {
    const { goal, settings, additionalClassNames } = props;
    const config = React.useContext(contexts_1.ConfigContext);
    const prefix = goal.goalPrefix ?? '⊢ ';
    const filteredList = getFilteredHypotheses(goal.hyps, settings);
    const hyps = settings.reverse ? filteredList.slice().reverse() : filteredList;
    const locs = React.useContext(goalLocation_1.LocationsContext);
    const goalLocs = React.useMemo(() => locs && goal.mvarId
        ? { ...locs, subexprTemplate: { mvarId: goal.mvarId, loc: { target: '' } } }
        : undefined, [locs, goal.mvarId]);
    const goalLi = (<div key={'goal'} data-is-goal>
            <strong className="goal-vdash">{prefix}</strong>
            <goalLocation_1.LocationsContext.Provider value={goalLocs}>
                <interactiveCode_1.InteractiveCode fmt={goal.type}/>
            </goalLocation_1.LocationsContext.Provider>
        </div>);
    let cn = 'font-code tl pre-wrap bl bw1 pl1 b--transparent mb3 ' + additionalClassNames;
    if (props.goal.isInserted)
        cn += ' b--inserted ';
    if (props.goal.isRemoved)
        cn += ' b--removed ';
    const children = [
        settings.reverse && goalLi,
        hyps.map((h, i) => <Hyp hyp={h} mvarId={goal.mvarId} key={i}/>),
        !settings.reverse && goalLi,
    ];
    if (goal.userName && !settings.hideGoalNames) {
        return (<details open className={cn}>
                <summary className="mv1 pointer" onClick={e => (0, util_1.preventClickOnTextSelection)(e)} onMouseDown={e => (0, util_1.preventDoubleClickTextSelection)(e)}>
                    <strong className="goal-case">case </strong>
                    {goal.userName}
                </summary>
                {children}
            </details>);
    }
    else
        return <div className={cn}>{children}</div>;
});
function Goals({ goals, settings, displayCount }) {
    const nGoals = goals.goals.length;
    const config = React.useContext(contexts_1.ConfigContext);
    if (nGoals === 0) {
        return <strong className="db2 mb2 goal-goals">No goals</strong>;
    }
    else {
        const unemphasizeCn = 'o-70 font-size-code-smaller';
        return (<>
                {displayCount && (<strong className="db mb2 goal-goals">
                        {nGoals} {1 < nGoals ? 'goals' : 'goal'}
                    </strong>)}
                {goals.goals.map((g, i) => (<exports.Goal key={i} goal={g} settings={settings} additionalClassNames={i !== 0 && settings.emphasizeFirstGoal ? unemphasizeCn : ''}/>))}
            </>);
    }
}
/**
 * Display goals together with a header containing the provided children as well as buttons
 * to control how the goals are displayed.
 */
exports.FilteredGoals = React.memo(({ headerChildren, goals, displayCount, initiallyOpen, togglingAction }) => {
    const ec = React.useContext(contexts_1.EditorContext);
    const config = React.useContext(contexts_1.ConfigContext);
    const [goalSettings, setGoalSettings] = React.useState(goalSettingsStateOfConfig(config));
    const goalSettingsDifferFromDefaultConfig = JSON.stringify(goalSettings) !== JSON.stringify(goalSettingsStateOfConfig(config));
    const disabledSaveStyle = goalSettingsDifferFromDefaultConfig
        ? {}
        : { color: 'var(--vscode-disabledForeground)', pointerEvents: 'none' };
    const saveConfig = React.useCallback(async () => {
        await ec.api.saveConfig({
            ...config,
            reverseTacticState: goalSettings.reverse,
            showGoalNames: !goalSettings.hideGoalNames,
            emphasizeFirstGoal: goalSettings.emphasizeFirstGoal,
            hideTypeAssumptions: !goalSettings.showType,
            hideInstanceAssumptions: !goalSettings.showInstance,
            hideInaccessibleAssumptions: !goalSettings.showHiddenAssumption,
            hideLetValues: !goalSettings.showLetValue,
        });
    }, [config, ec.api, goalSettings]);
    const mkSettingButton = (settingFn, filledFn, name) => (<a className="link pointer tooltip-menu-content non-selectable" onClick={_ => {
            setGoalSettings(settingFn);
        }}>
                <span className={'tooltip-menu-icon codicon ' + (filledFn(goalSettings) ? 'codicon-check ' : 'codicon-blank ')}>
                    &nbsp;
                </span>
                <span className="tooltip-menu-text ">{name}</span>
            </a>);
    const filterMenu = (<span>
                {mkSettingButton(s => ({ ...s, reverse: !s.reverse }), gs => gs.reverse, 'Display target before assumptions')}
                <br />
                {mkSettingButton(s => ({ ...s, showType: !s.showType }), gs => !gs.showType, 'Hide type assumptions')}
                <br />
                {mkSettingButton(s => ({ ...s, showInstance: !s.showInstance }), gs => !gs.showInstance, 'Hide instance assumptions')}
                <br />
                {mkSettingButton(s => ({ ...s, showHiddenAssumption: !s.showHiddenAssumption }), gs => !gs.showHiddenAssumption, 'Hide inaccessible assumptions')}
                <br />
                {mkSettingButton(s => ({ ...s, showLetValue: !s.showLetValue }), gs => !gs.showLetValue, 'Hide let-values')}
                <br />
                {mkSettingButton(s => ({ ...s, hideGoalNames: !s.hideGoalNames }), gs => gs.hideGoalNames, 'Hide goal names')}
                <br />
                {mkSettingButton(s => ({ ...s, emphasizeFirstGoal: !s.emphasizeFirstGoal }), gs => gs.emphasizeFirstGoal, 'Emphasize first goal')}
                <br className="saveConfigLineBreak" style={disabledSaveStyle}/>
                <a className="link pointer tooltip-menu-content saveConfigButton non-selectable" style={disabledSaveStyle} onClick={_ => saveConfig()}>
                    <span className="tooltip-menu-icon codicon codicon-save">&nbsp;</span>
                    <span className="tooltip-menu-text">Save current settings to default settings</span>
                </a>
            </span>);
    const settingsButton = (<tooltips_1.WithTooltipOnHover tooltipChildren={filterMenu} className="dim ">
                <a className={'link pointer mh2 codicon codicon-settings-gear'}/>
            </tooltips_1.WithTooltipOnHover>);
    const context = {};
    const id = React.useId();
    const useContextMenuEvent = (name, action, isEnabled, dependencies) => {
        if (isEnabled) {
            context[name + 'Id'] = id;
        }
        (0, util_1.useEvent)(ec.events.clickedContextMenu, _ => action(), dependencies, `${name}:${id}`);
    };
    const useSettingsContextMenuEvent = (name, setting, isEnabled) => useContextMenuEvent(name, () => setGoalSettings(s => ({ ...s, ...setting })), isEnabled);
    useSettingsContextMenuEvent('displayTargetBeforeAssumptions', { reverse: true }, !goalSettings.reverse);
    useSettingsContextMenuEvent('displayAssumptionsBeforeTarget', { reverse: false }, goalSettings.reverse);
    useSettingsContextMenuEvent('hideTypeAssumptions', { showType: false }, goalSettings.showType);
    useSettingsContextMenuEvent('showTypeAssumptions', { showType: true }, !goalSettings.showType);
    useSettingsContextMenuEvent('hideInstanceAssumptions', { showInstance: false }, goalSettings.showInstance);
    useSettingsContextMenuEvent('showInstanceAssumptions', { showInstance: true }, !goalSettings.showInstance);
    useSettingsContextMenuEvent('hideInaccessibleAssumptions', { showHiddenAssumption: false }, goalSettings.showHiddenAssumption);
    useSettingsContextMenuEvent('showInaccessibleAssumptions', { showHiddenAssumption: true }, !goalSettings.showHiddenAssumption);
    useSettingsContextMenuEvent('hideLetValues', { showLetValues: false }, goalSettings.showLetValue);
    useSettingsContextMenuEvent('showLetValues', { showLetValues: true }, !goalSettings.showLetValue);
    useSettingsContextMenuEvent('hideGoalNames', { hideGoalNames: true }, !goalSettings.hideGoalNames);
    useSettingsContextMenuEvent('showGoalNames', { hideGoalNames: false }, goalSettings.hideGoalNames);
    useSettingsContextMenuEvent('emphasizeFirstGoal', { emphasizeFirstGoal: true }, !goalSettings.emphasizeFirstGoal);
    useSettingsContextMenuEvent('deemphasizeFirstGoal', { emphasizeFirstGoal: false }, goalSettings.emphasizeFirstGoal);
    useContextMenuEvent('saveSettings', () => saveConfig(), goalSettingsDifferFromDefaultConfig, [saveConfig]);
    useContextMenuEvent('copyState', () => {
        if (goals !== undefined) {
            void ec.api.copyToClipboard(goalsToString(goals));
        }
    }, goals !== undefined);
    const setOpenRef = React.useRef();
    (0, util_1.useEvent)(ec.events.requestedAction, _ => {
        if (togglingAction !== undefined && setOpenRef.current !== undefined) {
            setOpenRef.current(t => !t);
        }
    }, [setOpenRef, togglingAction], togglingAction);
    return (<div style={goals !== undefined ? {} : { display: 'none' }} data-vscode-context={JSON.stringify(context)}>
                <collapsing_1.Details setOpenRef={r => (setOpenRef.current = r)} initiallyOpen={initiallyOpen}>
                    <>
                        {headerChildren}
                        <span className="fr" onClick={e => {
            e.preventDefault();
        }}>
                            {settingsButton}
                        </span>
                    </>
                    <div className="ml1">
                        {goals && <Goals goals={goals} settings={goalSettings} displayCount={displayCount}></Goals>}
                    </div>
                </collapsing_1.Details>
            </div>);
});
//# sourceMappingURL=goals.js.map