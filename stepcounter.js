let timerCheck = 0;
new Date();
let timer = 0;

function displayBar(token){
    let inCombat = false;
    for (let i=0; i<game.data.combat.length; i++){
        if (game.data.combat[i].round > 0) inCombat = true;
    }
    //console.log("In combat" + inCombat);
    if (inCombat == false) return;

    let oldBar = document.getElementById("show-action-dropdown-bar");
    if (oldBar != null)
        oldBar.remove();

    $(document.body).off("click.showTokenActionBar");
    $(document.body).off("contextmenu.showTokenActionBar");

    const cancel = () => {
        $dispOptions.remove();
        $(document.body).off("click.showTokenActionBar");
    };

    let targetActor = token;
    var display, data, targetId;
    if (targetActor == null) {
        display = "none";
        data = "";
        targetId = "";
    } else {
        display ="flex";
        let speed = getTokenSpeed(token);
        let stepsMoved = Math.round(token.getFlag('StepCounter','stepsTaken'));
        let dash;
        if (token.getFlag('StepCounter','dash')) dash = "yes";
        else dash = "no";
        let data1 = "Moved: " + stepsMoved + "/" + speed + " Ft.   Dash: " + dash;
        data = [data1];
        targetId = targetActor._id;
    }

    //save coordiants and retrieve => client/user flag (TokenBar,Coord)
    //click on bar?? let them move it
    let navBounds = document.getElementById("navigation").getBoundingClientRect();
    let y = navBounds.bottom + 20;

    let controlBounds = document.getElementById("controls").getBoundingClientRect();
    let x = controlBounds.right + 50;

    const $dispOptions = $(`<div class="tokenbar" targetID="${targetId}" id="show-action-dropdown-bar" style="display: ${display}; z-index: 70; position: fixed; top: ${y}px; height: auto; left: ${x}px; background-color: #bbb">${data}</div>`).appendTo(document.body);
}

function getTokenSpeed(token){
    let speed = parseInt(token.actor.data.data.attributes.speed.value);
    let speedSpecial = parseInt(token.actor.data.data.attributes.speed.special);
    if (speedSpecial > speed) speed = speedSpecial;
    let dash = token.getFlag('StepCounter','dash');
    if (dash) speed *= 2;

    return speed;
}

Hooks.on('ready', ()=>{
    let payload;
    game.socket.on(`module.StepCounter`, (payload) =>{
      console.log(payload);
    });
});

Hooks.once('init', function(){
    
    game.settings.register('StepCounter','Block', {
        name: "Block Movement",
        hint: "Block players from moving tokens if their movement has been exceeded (disables the dialog box)",
        scope: "global",
        config: true,
        default: false,
        type: Boolean
        //onChange: x => window.location.reload()
    });
    game.settings.register('StepCounter','PlayerRequest', {
        name: "GM Request Button",
        hint: "Allow players to request the GM to allow movement past their speed limit in the dialog box",
        scope: "global",
        config: true,
        default: true,
        type: Boolean
        //onChange: x => window.location.reload()
    });
    game.settings.register('StepCounter','PlayerReset', {
        name: "Step Counter Reset Button",
        hint: "Allow players to reset their step counter in the dialog box",
        scope: "global",
        config: true,
        default: false,
        type: Boolean
        //onChange: x => window.location.reload()
    });
    game.settings.register('StepCounter','PlayerIgnore', {
        name: "Ignore Dialog Button",
        hint: "Allow players to ignore the dialog box",
        scope: "global",
        config: true,
        default: false,
        type: Boolean
        //onChange: x => window.location.reload()
    });
    game.settings.register('StepCounter','ChatMessages', {
        name: "Chat Messages",
        hint: "Creates a chat message whenever a player uses dash or ignores its speed limit",
        scope: "global",
        config: true,
        default: true,
        type: Boolean
        //onChange: x => window.location.reload()
    });
});

Hooks.on("updateCombat", (combat, updateData, otherData, userId) => {
    //console.log("updateCombat");
    for (let i=0; i<canvas.tokens.children[0].children.length; i++){
        let token = canvas.tokens.children[0].children[i];
    
        token.setFlag('StepCounter','startCoordinateX', token.data.x);
        token.setFlag('StepCounter','startCoordinateY', token.data.y);
        token.setFlag('StepCounter','stepsTaken', 0);
        token.setFlag('StepCounter','dash',false);
    }
});

Hooks.on("deleteCombat", (combat, id, options) => {
    let oldBar = document.getElementById("show-action-dropdown-bar");
    if (oldBar != null)
        oldBar.remove();
});

Hooks.on('controlToken', (token,controlled)=>{
    displayBar(token);
});

Hooks.on('controlToken', (token,controlled)=>{
    let payload = {"sender": game.userId, "receiver": "test", "data": "test2"};
    game.socket.emit(`module.StepCounter`, payload);
    
    if (token._controlled == false) return;
    token.setFlag('StepCounter','startCoordinateX', token.data.x);
    token.setFlag('StepCounter','startCoordinateY', token.data.y);

    Hooks.on('updateToken',(a,b,c,d,user)=>{
        if (token._controlled == false) return;
        if (user != game.userId) return;
        //Check if the user is GM
        let isGM = false;
        for (let i=0; i<game.data.users.length; i++)
            if (game.data.users[i]._id == game.userId && game.data.users[i].role > 2) 
                isGM = true;
            

        //Check if combat is currently going on. Do not continue if not
        let inCombat = false;
        for (let i=0; i<game.data.combat.length; i++){
            if (game.data.combat[i].round > 0) inCombat = true;
        }
        if (inCombat == false) return;

        //To prevent the dialog from appearing multiple times, set a timer
        if (Date.now() - timer > 50) {
            timerCheck = 0;
            timer = Date.now();
        }

        //Calculate the steps taken in the X and Y direction by comparing the current position to the previous position. Divide by canvas.dimensions.size to get grid boxes
        let currentPositionX = token.data.x;
        let currentPositionY = token.data.y;
        let oldPositionX = token.getFlag('StepCounter','startCoordinateX');
        let oldPositionY = token.getFlag('StepCounter','startCoordinateY');
        let stepsTakenX = Math.abs(oldPositionX - currentPositionX)/canvas.dimensions.size; 
        let stepsTakenY = Math.abs(oldPositionY - currentPositionY)/canvas.dimensions.size;
        
        //Check what kind of diagonal movement rules are being used.
        let stepsTaken = 0;
        let diagonalMovement = game.settings.get("dnd5e","diagonalMovement");
        
        //Default DND rules: Diagonal movement is free, so take the biggest value of stepsTakenX or stepsTakenY
        if (diagonalMovement == "555"){
            stepsTaken = stepsTakenX;
            if (stepsTakenY > stepsTaken) stepsTaken = stepsTakenY;
        }
        //Euclidian rules: use pythagorean theorem to calculate the distance
        else if (diagonalMovement = "EUCL") stepsTaken = Math.sqrt(stepsTakenX * stepsTakenX + stepsTakenY * stepsTakenY);
        
        //Multiply by the canvas.dimensions.distance to get feet
        stepsTaken *= canvas.dimensions.distance;
        
        //If the token has moved, and timerCheck is 0, continue
        if (stepsTaken > 0 && timerCheck == 0){
            //set timerCheck to 1, get the speed of the token, get the amount of steps the token has already moved
            timerCheck = 1;
            let speed = getTokenSpeed(token);
            let totalSteps = token.getFlag('StepCounter','stepsTaken');

            //Check if the previous movement + new movement is bigger than the token's speed
            if (Math.round(stepsTaken + token.getFlag('StepCounter','stepsTaken'))>speed) {

                //Check if the user has enabled the block tickbox, which will automatically force the token back to its original position
                if (game.settings.get("StepCounter","Block")){
                    token.shiftPosition((oldPositionX - currentPositionX)/canvas.dimensions.size,(oldPositionY - currentPositionY)/canvas.dimensions.size,true);
                    token.setFlag('StepCounter','startCoordinateX', oldPositionX);
                    token.setFlag('StepCounter','startCoordinateY', oldPositionY);
                    ui.notifications.warn("You cannot move more than your speed allows"); 
                    timer = Date.now();
                }
                else {
                    //Create a dialog, with buttons based on the current situation
                    let applyChanges = 0;
                    let buttons = {
                        //Undo button is always available
                        Undo: {
                            icon: "<i class='fas fa-check'></i>",
                            label: `Undo`,
                            callback: () => applyChanges = 0
                        }
                    }
                    //Check if token is using dash. If not, add a button to apply it
                    if (token.getFlag('StepCounter','dash')==false){
                        buttons.Dash = {
                            icon: "<i class='fas fa-check'></i>",
                            label: `Dash`,
                            callback: () => applyChanges = 1
                        }
                    }
                    //Check if the user is GM, otherwise check if the user is allowed to reset the step counter. If so, add reset button
                    if (game.settings.get("StepCounter","PlayerReset")==true || isGM){
                        buttons.Reset = {
                            icon: "<i class='fas fa-check'></i>",
                            label: `Reset`,
                            callback: () => applyChanges = 2
                        }
                    }
                    //Check if the user is GM, otherwise check if the user is allowed to ignore the step counter. If so, add ignore button
                    if (game.settings.get("StepCounter","PlayerIgnore")==true || isGM){
                        buttons.Ignore = {
                            icon: "<i class='fas fa-check'></i>",
                            label: `Ignore`,
                            callback: () => applyChanges = 3
                        }
                    }
                    //Check if the user is player, add request button if enabled
                    if (game.settings.get("StepCounter","PlayerRequest")==true && isGM == false){
                        buttons.Request = {
                            icon: "<i class='fas fa-check'></i>",
                            label: `Request`,
                            callback: () => applyChanges = 4
                        }
                    }
                    let d = new Dialog({
                        title: `Too much movement!`,
                        content: ` You moved more than your speed allows<br><br>Moved: ` + Math.round(stepsTaken + token.getFlag('StepCounter','stepsTaken')) + ` Ft.<br>Speed: `+ speed + ` Ft.<br><br>`,
                        buttons,
                        default: "Ignore",
                        close: html => {
                            console.log(applyChanges);
                            //If 'Undo' is pressed, move token back to previous position
                            if (applyChanges == 0){ //undo
                                token.shiftPosition((oldPositionX - currentPositionX)/canvas.dimensions.size,(oldPositionY - currentPositionY)/canvas.dimensions.size,true);
                                token.setFlag('StepCounter','startCoordinateX', oldPositionX);
                                token.setFlag('StepCounter','startCoordinateY', oldPositionY);
                                timer = Date.now();
                            }
                            //if 'Dash' is pressed, apply dash and continue movement
                            else if (applyChanges == 1) { //dash
                                console.log("test");
                                token.setFlag('StepCounter','dash',true);
                                for (let i=0; i<game.users.length; i++){
                                    if (game.data.users[i].role > 2) 
                                        console.log(game.users[i]._id);
                                        ChatMessage.create({
                                            content: token.name + " used dash" ,
                                            whisper: [game.users[i]._id]
                                    });                                                                                      
                                }
                                totalSteps = token.getFlag('StepCounter','stepsTaken') + stepsTaken;
                                token.setFlag('StepCounter','stepsTaken', totalSteps);
                                timer = Date.now();
                            }
                            //If 'Reset' is pressed, reset step counter and continue movement
                            else if (applyChanges == 2){ //reset
                                for (let i=0; i<game.data.users.length; i++){
                                    if (game.data.users[i].role > 2) 
                                    
                                        ChatMessage.create({
                                            content: token.name + " has reset its step counter" ,
                                            whisper: [game.data.users[i]._id]
                                    });                                                                                      
                                }
                                token.setFlag('StepCounter','startCoordinateX', token.data.x);
                                token.setFlag('StepCounter','startCoordinateY', token.data.y);
                                token.setFlag('StepCounter','stepsTaken', stepsTaken);
                                token.setFlag('StepCounter','dash',false);
                                timer = Date.now();
                            }
                            //If 'Ignore' is pressed, continue movement
                            else if (applyChanges == 3) { //ignore
                                console.log(game.data.users.length);
                                for (let i=0; i<game.data.users.length; i++){
                                    console.log(game.data.users[i]._id);
                                    if (game.data.users[i].role > 2) 
                                        ChatMessage.create({
                                            content: token.name + " ignored its speed limit" ,
                                            whisper: [game.data.users[i]._id]
                                    });                                                                                      
                                }
                                token.setFlag('StepCounter','startCoordinateX', token.data.x);
                                token.setFlag('StepCounter','startCoordinateY', token.data.y);
                                totalSteps = token.getFlag('StepCounter','stepsTaken') + stepsTaken;
                                token.setFlag('StepCounter','stepsTaken', totalSteps);
                                timer = Date.now();
                            }  
                            //If 'Request' is pressed, request the GM
                        }
                    });
                    d.render(true);
                }               
            }
            else {
                totalSteps += stepsTaken;
                token.setFlag('StepCounter','startCoordinateX', token.data.x);
                token.setFlag('StepCounter','startCoordinateY', token.data.y);
            }
            //console.log(totalSteps);
            //console.log("Speed: " + speed + " Pre: X: " + oldPositionX + " Y: " + oldPositionY + "    Post: X: " + currentPositionX + " Y: " + currentPositionY + " StepsTaken: " + stepsTaken + " TotalSteps: " + totalSteps + "StepsRound: " + Math.round(totalSteps));
           
            token.setFlag('StepCounter','stepsTaken', totalSteps);
        }
        displayBar(token);
        
        timer = Date.now();
        
    })
    

})