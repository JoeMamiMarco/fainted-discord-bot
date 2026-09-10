using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace FaintedDesktop {
  sealed class Dashboard : Form {
    readonly string root = AppDomain.CurrentDomain.BaseDirectory;
    readonly Color background = Color.FromArgb(13,17,25), surface = Color.FromArgb(23,29,41), muted = Color.FromArgb(155,168,190), accent = Color.FromArgb(139,109,255), green = Color.FromArgb(93,216,171), amber = Color.FromArgb(250,198,107);
    readonly TextBox activity = new TextBox();
    readonly Label badge = new Label(), headline = new Label(), detail = new Label(), botValue = new Label(), aiValue = new Label(), uptime = new Label(), telemetry = new Label(), notice = new Label();
    readonly Button start = new Button(), stop = new Button(), restart = new Button(), settings = new Button(), register = new Button(), setup = new Button(), test = new Button();
    readonly System.Windows.Forms.Timer stopTimer = new System.Windows.Forms.Timer(), clock = new System.Windows.Forms.Timer();
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    Process process; ProcessJob job;
    bool stopping, closing, restartRequested, online, hadError;
    string mode = "", lastError = "", logPath;
    DateTime onlineSince;
    string[] secrets = new string[0];

    public Dashboard() {
      Text = "Fainted Dashboard"; ClientSize = new Size(1020,740); MinimumSize = new Size(1036,779);
      AutoScaleMode = AutoScaleMode.Dpi; StartPosition = FormStartPosition.CenterScreen;
      Font = new Font("Segoe UI",10); BackColor = background; ForeColor = Color.FromArgb(235,240,248); Icon = SystemIcons.Shield;
      logPath = Path.Combine(root,"runtime","dashboard.log");
      var nav = new Panel { Dock = DockStyle.Left, Width = 198, BackColor = Color.FromArgb(18,23,33) }; Controls.Add(nav);
      LabelOn(nav,"F",24,24,46,44,25,accent,true);
      LabelOn(nav,"FAINTED",70,27,120,32,17,ForeColor,true);
      LabelOn(nav,"SERVER CONTROL",25,81,155,25,8,muted,true);
      var selected = new Panel { Location = new Point(16,127), Size = new Size(166,44), BackColor = Color.FromArgb(43,36,68) };nav.Controls.Add(selected);
      LabelOn(selected,"Overview",17,10,140,25,11,Color.FromArgb(196,178,255),true);
      LabelOn(nav,"CONFIGURATION",25,202,160,24,8,muted,true);
      ButtonOn(nav,settings,"Bot settings",16,235,166,40,EditSettings,false);
      ButtonOn(nav,register,"Sync commands",16,284,166,40,()=>Run("register"),false);
      ButtonOn(nav,setup,"Install / repair AI",16,333,166,40,()=>Run("setup"),false);
      ButtonOn(nav,test,"Test local AI",16,382,166,40,()=>Run("test-ai"),false);
      ButtonOn(nav,new Button(),"Developer Portal",16,469,166,40,OpenPortal,false);
      ButtonOn(nav,new Button(),"Open bot folder",16,518,166,40,()=>Open(root),false);
      var local=LabelOn(nav,"LOCAL CONTROL\nYour token stays on this PC.\nNo AI API key required.",25,646,160,70,9,muted,false);local.Anchor=AnchorStyles.Left|AnchorStyles.Bottom;

      var body = new Panel { Location = new Point(222,0), Size = new Size(774,740), Anchor = AnchorStyles.Top|AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right }; Controls.Add(body);
      LabelOn(body,"Overview",0,26,440,43,25,ForeColor,true);
      LabelOn(body,"Manage your bot from one place.",2,76,470,26,10,muted,false);
      badge.Location=new Point(580,37);badge.Size=new Size(193,34);badge.TextAlign=ContentAlignment.MiddleRight;badge.Font=new Font(Font,FontStyle.Bold);badge.Anchor=AnchorStyles.Right|AnchorStyles.Top;body.Controls.Add(badge);

      var hero=new Panel{Location=new Point(0,124),Size=new Size(774,173),BackColor=surface,Anchor=AnchorStyles.Left|AnchorStyles.Right|AnchorStyles.Top};body.Controls.Add(hero);
      headline.Location=new Point(22,19);headline.Size=new Size(730,35);headline.Font=new Font("Segoe UI",18,FontStyle.Bold);hero.Controls.Add(headline);
      detail.Location=new Point(24,63);detail.Size=new Size(725,42);detail.ForeColor=muted;detail.Anchor=AnchorStyles.Left|AnchorStyles.Right|AnchorStyles.Top;hero.Controls.Add(detail);
      ButtonOn(hero,start,"Start bot",24,115,192,40,()=>Run("start"),true);
      ButtonOn(hero,stop,"Stop bot",228,115,164,40,Stop,false);
      ButtonOn(hero,restart,"Restart",404,115,145,40,()=>{restartRequested=true;Stop();},false);

      Card(body,"DISCORD BOT",botValue,0,316,250);
      Card(body,"LOCAL AI",aiValue,262,316,250);
      Card(body,"UPTIME",uptime,524,316,250);
      notice.Location=new Point(2,423);notice.Size=new Size(770,58);notice.ForeColor=amber;notice.Anchor=AnchorStyles.Left|AnchorStyles.Right|AnchorStyles.Top;body.Controls.Add(notice);
      LabelOn(body,"Activity",0,487,190,30,13,ForeColor,true);
      telemetry.Location=new Point(230,489);telemetry.Size=new Size(540,26);telemetry.TextAlign=ContentAlignment.MiddleRight;telemetry.ForeColor=muted;telemetry.Font=new Font("Segoe UI",9);telemetry.Anchor=AnchorStyles.Top|AnchorStyles.Right;body.Controls.Add(telemetry);
      activity.Location=new Point(0,527);activity.Size=new Size(774,157);activity.Anchor=AnchorStyles.Left|AnchorStyles.Right|AnchorStyles.Top|AnchorStyles.Bottom;
      activity.Multiline=true;activity.ReadOnly=true;activity.ScrollBars=ScrollBars.Vertical;activity.BackColor=surface;activity.ForeColor=Color.FromArgb(181,196,216);activity.Font=new Font("Consolas",9);activity.BorderStyle=BorderStyle.FixedSingle;body.Controls.Add(activity);
      var footer=LabelOn(body,"Keep this dashboard open. Closing it shuts down the bot and local AI.",0,703,774,23,9,muted,false);footer.Anchor=AnchorStyles.Left|AnchorStyles.Bottom;
      Idle();
      Append("Ready. Press Start bot. Commands sync automatically.");
      stopTimer.Interval=8000;stopTimer.Tick+=(s,e)=>{stopTimer.Stop();Append("Finishing shutdown of owned processes...");if(job!=null){job.Dispose();job=null;}try{if(process!=null&&!process.HasExited)process.Kill();}catch{}};
      clock.Interval=1000;clock.Tick+=(s,e)=>{if(online)uptime.Text=(DateTime.UtcNow-onlineSince).ToString(@"hh\:mm\:ss");};clock.Start();
      FormClosing+=(s,e)=>{if(process!=null){e.Cancel=true;closing=true;restartRequested=false;Stop();}else{clock.Stop();stopTimer.Stop();if(job!=null){job.Dispose();job=null;}}};
    }
    Label LabelOn(Control parent,string text,int x,int y,int width,int height,int size,Color color,bool bold){var label=new Label{Text=text,Location=new Point(x,y),Size=new Size(width,height),ForeColor=color,Font=new Font("Segoe UI",size,bold?FontStyle.Bold:FontStyle.Regular)};parent.Controls.Add(label);return label;}
    void Card(Control parent,string title,Label value,int x,int y,int width){var card=new Panel{Location=new Point(x,y),Size=new Size(width,92),BackColor=surface};parent.Controls.Add(card);LabelOn(card,title,17,14,width-34,22,8,muted,true);value.Location=new Point(17,40);value.Size=new Size(width-34,37);value.Font=new Font("Segoe UI",16,FontStyle.Bold);card.Controls.Add(value);}
    void ButtonOn(Control parent,Button b,string text,int x,int y,int width,int height,Action action,bool primary){b.Text=text;b.Location=new Point(x,y);b.Size=new Size(width,height);b.FlatStyle=FlatStyle.Flat;b.FlatAppearance.BorderSize=0;b.BackColor=primary?accent:Color.FromArgb(35,43,59);b.ForeColor=Color.White;b.Cursor=Cursors.Hand;b.Click+=(s,e)=>action();parent.Controls.Add(b);}
    void UI(Action action){if(IsDisposed||Disposing)return;try{if(InvokeRequired)BeginInvoke(action);else action();}catch(InvalidOperationException){}}
    string Redact(string line){foreach(string secret in secrets)if(secret.Length>6)line=line.Replace(secret,"[hidden]");return line;}
    void Append(string line){if(String.IsNullOrEmpty(line))return;line=Redact(line);string safe=line;UI(()=>{string entry=DateTime.Now.ToString("HH:mm:ss")+"  "+safe+Environment.NewLine;if(activity.TextLength>65000)activity.Text=activity.Text.Substring(activity.TextLength-40000);activity.AppendText(entry);activity.SelectionStart=activity.TextLength;activity.ScrollToCaret();try{Directory.CreateDirectory(Path.GetDirectoryName(logPath));if(File.Exists(logPath)&&new FileInfo(logPath).Length>1000000)File.WriteAllText(logPath,"");File.AppendAllText(logPath,entry);}catch{}});}
    string ReadSetting(string key){string path=Path.Combine(root,".env");if(!File.Exists(path))return "";string line=File.ReadAllLines(path).FirstOrDefault(l=>l.StartsWith(key+"="));return line==null?"":line.Substring(key.Length+1).Trim().Trim('"','\'');}
    string FindNode(){string portable=Path.Combine(root,"runtime","node","node.exe");if(File.Exists(portable))return portable;string bundled=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),@".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe");if(File.Exists(bundled))return bundled;foreach(string dir in (Environment.GetEnvironmentVariable("PATH")??"").Split(';')){try{string p=Path.Combine(dir.Trim('"'),"node.exe");if(File.Exists(p))return p;}catch{}}throw new Exception("Install Node.js 24 or newer, then retry.");}
    void Idle(){badge.Text="●  OFFLINE";badge.ForeColor=muted;headline.Text="Ready when you are";detail.Text="Start connects to Discord and prepares your commands automatically.";botValue.Text="Offline";botValue.ForeColor=muted;aiValue.Text="Stopped";uptime.Text="00:00:00";telemetry.Text="";notice.Text="Use Bot settings if you need to change your token or server.";Buttons(false);}
    void Buttons(bool active){start.Enabled=settings.Enabled=register.Enabled=setup.Enabled=test.Enabled=!active;stop.Enabled=active&&!stopping;restart.Enabled=active&&!stopping&&mode=="start";start.Text=hadError?"Retry start":"Start bot";}
    void Receive(string line){if(line==null)return;if(!line.StartsWith("@@FAINTED ")){Append(line);return;}try{var data=json.Deserialize<Dictionary<string,object>>(line.Substring(10));UI(()=>Event(data));}catch{Append("Could not read a status update.");}}
    string Field(Dictionary<string,object> data,string key){object value;return data.TryGetValue(key,out value)&&value!=null?value.ToString():"";}
    void Event(Dictionary<string,object> data){string type=Field(data,"type"),message=Redact(Field(data,"message"));
      if(type=="error"){hadError=true;lastError=message;notice.Text=message;headline.Text="Something needs attention";badge.Text="●  NEEDS ATTENTION";badge.ForeColor=amber;Append(message);}
      else if(type=="warning"){notice.Text=message;Append(message);}
      else if(type=="phase"){if(!hadError)detail.Text=message;Append(message);}
      else if(type=="ai"){aiValue.Text=message;}
      else if(type=="commands"){Append(message);}
      else if(type=="online"){if(stopping)return;online=true;onlineSince=DateTime.UtcNow;badge.Text=Field(data,"limited")=="True"?"●  ONLINE / LIMITED":"●  ONLINE";badge.ForeColor=green;headline.Text="Your bot is online";detail.Text=Field(data,"bot")+"  •  "+Field(data,"server");botValue.Text="Connected";botValue.ForeColor=green;Append("Connected to Discord. Use /help in your server.");}
      else if(type=="reconnecting"){badge.Text="●  RECONNECTING";badge.ForeColor=amber;botValue.Text="Reconnecting";Append(message);}
      else if(type=="resumed"){badge.Text="●  ONLINE";badge.ForeColor=green;botValue.Text="Connected";Append(message);}
      else if(type=="stats"){telemetry.Text=Field(data,"ping")+" ms latency  •  Bot memory "+Field(data,"memory")+" MB";}
    }
    void Run(string operation){if(process!=null)return;mode=operation;hadError=false;lastError="";stopping=false;online=false;notice.Text="";telemetry.Text="";
      try{string env=Path.Combine(root,".env");if(!File.Exists(env))File.Copy(Path.Combine(root,".env.example"),env);secrets=File.ReadAllLines(env).Where(l=>l.StartsWith("DISCORD_TOKEN=")||l.Contains("API_KEY=")).Select(l=>l.Substring(l.IndexOf('=')+1).Trim().Trim('"','\'')).Where(v=>v.Length>6).ToArray();
        var ownedJob=new ProcessJob();job=ownedJob;
        var current=new Process{StartInfo=new ProcessStartInfo(FindNode(),"--env-file-if-exists=.env src/desktop.js "+operation+" --panel-mode"){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true},EnableRaisingEvents=true};process=current;
        current.OutputDataReceived+=(s,e)=>Receive(e.Data);current.ErrorDataReceived+=(s,e)=>Append(e.Data);
        current.Exited+=(s,e)=>{int code=1;try{current.WaitForExit();code=current.ExitCode;}catch{}int exitCode=code;UI(()=>Finished(current,ownedJob,exitCode));};
        headline.Text=operation=="start"?"Starting your bot":"Working on "+operation;detail.Text="Preparing your local services...";badge.Text="●  STARTING";badge.ForeColor=accent;botValue.Text=operation=="start"?"Connecting":"Offline";botValue.ForeColor=muted;aiValue.Text="Checking...";uptime.Text="00:00:00";Buttons(true);Append("Starting "+operation+"...");
        current.Start();ownedJob.Add(current);current.BeginOutputReadLine();current.BeginErrorReadLine();
      }catch(Exception e){try{if(process!=null&&!process.HasExited)process.Kill();}catch{}if(job!=null){job.Dispose();job=null;}process=null;hadError=true;lastError=e.Message;Idle();headline.Text="Could not start";notice.Text=lastError;badge.Text="●  NEEDS ATTENTION";badge.ForeColor=amber;Append(lastError);}
    }
    void Finished(Process current,ProcessJob ownedJob,int code){ownedJob.Dispose();if(process!=current)return;stopTimer.Stop();job=null;process=null;current.Dispose();bool requested=stopping;stopping=false;online=false;bool retry=restartRequested;restartRequested=false;bool failed=hadError||(code!=0&&!requested);string reason=lastError;Idle();if(failed){hadError=true;headline.Text="Could not keep the bot running";notice.Text=String.IsNullOrEmpty(reason)?"See Activity for details. Check Bot settings and press Retry start.":reason;badge.Text="●  NEEDS ATTENTION";badge.ForeColor=amber;detail.Text="The error is shown below. You can edit settings and try again.";start.Text="Retry start";}else if(mode!="start"&&!requested){headline.Text="Task completed";notice.Text="You can start the bot whenever you are ready.";}Append(requested?"Stopped. All owned services have closed.":failed?"Stopped after an error.":"Task complete.");if(closing){Close();return;}if(retry)Run("start");}
    void Stop(){if(process==null||stopping)return;stopping=true;online=false;Buttons(true);headline.Text=closing?"Closing safely...":"Stopping your bot...";detail.Text="Disconnecting from Discord and closing local AI.";badge.Text="●  STOPPING";badge.ForeColor=amber;Append("Stop requested.");stopTimer.Start();try{process.StandardInput.WriteLine("stop");process.StandardInput.Flush();}catch{if(job!=null){job.Dispose();job=null;}}}
    void Open(string target){try{Process.Start(new ProcessStartInfo(target){UseShellExecute=true});}catch(Exception e){Append(e.Message);}}
    void OpenPortal(){string id=ReadSetting("DISCORD_CLIENT_ID");Open("https://discord.com/developers/applications"+(System.Text.RegularExpressions.Regex.IsMatch(id,@"^\d{17,20}$")?"/"+id+"/bot":""));}
    void EditSettings(){try{string path=Path.Combine(root,".env");if(!File.Exists(path))File.Copy(Path.Combine(root,".env.example"),path);string[] lines=File.ReadAllLines(path),keys={"DISCORD_TOKEN","DISCORD_CLIENT_ID","DISCORD_GUILD_ID"};
      using(var form=new Form{Text="Bot settings",ClientSize=new Size(550,435),StartPosition=FormStartPosition.CenterParent,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=false,BackColor=background,ForeColor=ForeColor,Font=Font}){
        LabelOn(form,"Connect your Discord bot",22,19,500,35,18,ForeColor,true);var boxes=new TextBox[3];string[] labels={"Bot token","Application ID","Server ID"};
        for(int i=0;i<3;i++){LabelOn(form,labels[i],24,72+i*77,490,24,10,muted,false);boxes[i]=new TextBox{Location=new Point(24,99+i*77),Size=new Size(500,27),UseSystemPasswordChar=i==0,Text=ReadSetting(keys[i])};form.Controls.Add(boxes[i]);}
        LabelOn(form,"Enable Server Members Intent and Message Content Intent\nin Developer Portal > Bot for all moderation and member features.",24,312,503,48,10,amber,false);
        ButtonOn(form,new Button(),"Developer Portal",24,382,181,34,OpenPortal,false);
        ButtonOn(form,new Button(),"Save settings",349,382,175,34,()=>{if(boxes.Any(b=>String.IsNullOrWhiteSpace(b.Text))||!boxes.Skip(1).All(b=>System.Text.RegularExpressions.Regex.IsMatch(b.Text.Trim(),@"^\d{17,20}$"))){MessageBox.Show(form,"Fill the token and both numeric Discord IDs (17–20 digits).","Check settings");return;}var updated=lines.ToList();for(int i=0;i<3;i++){string value=boxes[i].Text.Trim().Replace("\r","").Replace("\n","");updated.RemoveAll(l=>l.StartsWith(keys[i]+"="));updated.Add(keys[i]+"="+value);}File.WriteAllLines(path,updated.ToArray(),new UTF8Encoding(false));Append("Settings saved locally.");form.Close();},true);form.ShowDialog(this);
      }}catch(Exception e){Append("Could not save settings: "+e.Message);}}
    public void Preview(string path){Show();Application.DoEvents();using(var bitmap=new Bitmap(Width,Height)){DrawToBitmap(bitmap,new Rectangle(0,0,Width,Height));bitmap.Save(path,System.Drawing.Imaging.ImageFormat.Png);}Hide();}
    public void CloseTest(string path,bool duringStartup){Show();Run("start");var watch=new System.Windows.Forms.Timer{Interval=200};DateTime began=DateTime.UtcNow;bool reached=false;FormClosed+=(s,e)=>{watch.Stop();File.WriteAllText(path,(reached&&process==null&&!hadError?"PASS":"FAIL")+": close "+(duringStartup?"during startup":"while online")+"\n"+activity.Text);};watch.Tick+=(s,e)=>{if((duringStartup||online)&&!closing){reached=true;Close();}else if(hadError||(DateTime.UtcNow-began).TotalSeconds>80){Close();}};watch.Start();Application.Run(this);watch.Dispose();}
    public void SelfTest(string path){Show();Run("start");var watch=new System.Windows.Forms.Timer{Interval=250};DateTime began=DateTime.UtcNow;int cycles=0;bool asked=false;watch.Tick+=(s,e)=>{if(online&&!asked){asked=true;cycles++;if(cycles==1){restartRequested=true;Stop();}else Stop();}if(asked&&process!=null&&!stopping&&!online)asked=false;if(cycles>=2&&process==null){watch.Stop();File.WriteAllText(path,"PASS: connected, restarted, connected again, stopped.\n"+activity.Text);Close();}else if(hadError&&process==null||(DateTime.UtcNow-began).TotalSeconds>150){watch.Stop();File.WriteAllText(path,"FAIL: "+lastError+"\n"+activity.Text);Close();}};watch.Start();Application.Run(this);watch.Dispose();}
  }
}
