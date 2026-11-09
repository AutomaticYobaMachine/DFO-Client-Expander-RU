//go:build windows

// Independent desktop capture of the visible game client. No pixels are saved.
// This samples the Windows desktop DC, not Chromium NativeImage/PrintWindow.
package main

import(
 "encoding/json"
 "fmt"
 "hash/fnv"
 "io"
 "os"
 "strconv"
 "strings"
 "syscall"
 "time"
 "unsafe"
)
const w=288
const h=162
type rect struct{L,T,R,B int32}
type point struct{X,Y int32}
type bmiHeader struct{
 Size uint32
 Width,Height int32
 Planes,BitCount uint16
 Compression,ImageSize uint32
 XPels,YPels int32
 Used,Important uint32
}
type bmi struct{Header bmiHeader;Color uint32}
type sample struct{
 Type string `json:"type"`
 At int64 `json:"at"`
 Valid bool `json:"valid"`
 Reason string `json:"reason"`
 Foreground bool `json:"foreground"`
 Visible bool `json:"visible"`
 Minimized bool `json:"minimized"`
 Width int32 `json:"width"`
 Height int32 `json:"height"`
 ColorBins int `json:"colorBins"`
 Regions string `json:"regions"`
 ChangedRegions int `json:"changedRegions"`
 CenterChanged bool `json:"centerChanged"`
 CenterAgeMs int64 `json:"centerAgeMs"`
 CaptureMs int64 `json:"captureMs"`
}
var (
 user32=syscall.NewLazyDLL("user32.dll")
 gdi32=syscall.NewLazyDLL("gdi32.dll")
 isWindow=user32.NewProc("IsWindow")
 isVisible=user32.NewProc("IsWindowVisible")
 isIconic=user32.NewProc("IsIconic")
 getForeground=user32.NewProc("GetForegroundWindow")
 getAncestor=user32.NewProc("GetAncestor")
 getClient=user32.NewProc("GetClientRect")
 clientToScreen=user32.NewProc("ClientToScreen")
 getDC=user32.NewProc("GetDC")
 releaseDC=user32.NewProc("ReleaseDC")
 getMetric=user32.NewProc("GetSystemMetrics")
 setDpi=user32.NewProc("SetProcessDpiAwarenessContext")
 setDpiOld=user32.NewProc("SetProcessDPIAware")
 createDC=gdi32.NewProc("CreateCompatibleDC")
 deleteDC=gdi32.NewProc("DeleteDC")
 createDIB=gdi32.NewProc("CreateDIBSection")
 selectObject=gdi32.NewProc("SelectObject")
 deleteObject=gdi32.NewProc("DeleteObject")
 setMode=gdi32.NewProc("SetStretchBltMode")
 stretch=gdi32.NewProc("StretchBlt")
)
func yes(p *syscall.LazyProc,a ...uintptr)bool{r,_,_:=p.Call(a...);return r!=0}
func metric(i uintptr)int32{r,_,_:=getMetric.Call(i);return int32(r)}
func capture(hwnd uintptr)([]byte,int32,int32,string,bool,bool,bool){
 if !yes(isWindow,hwnd){return nil,0,0,"invalid-window",false,false,false}
 visible:=yes(isVisible,hwnd)
 minimized:=yes(isIconic,hwnd)
 foreground,_,_:=getForeground.Call()
 a,_,_:=getAncestor.Call(hwnd,2)
 b,_,_:=getAncestor.Call(foreground,2)
 focused:=a!=0 && a==b
 if !visible||minimized||!focused{return nil,0,0,"not-foreground-visible",focused,visible,minimized}
 var rc rect
 if !yes(getClient,hwnd,uintptr(unsafe.Pointer(&rc))){
  return nil,0,0,"client-bounds-error",focused,visible,minimized
 }
 ww,hh:=rc.R-rc.L,rc.B-rc.T
 if ww<200||hh<150||ww>16384||hh>16384{return nil,ww,hh,"unsupported-bounds",focused,visible,minimized}
 xy:=point{}
 if !yes(clientToScreen,hwnd,uintptr(unsafe.Pointer(&xy))){
  return nil,ww,hh,"client-origin-error",focused,visible,minimized
 }
 vx,vy,vw,vh:=metric(76),metric(77),metric(78),metric(79)
 if xy.X<vx||xy.Y<vy||xy.X+ww>vx+vw||xy.Y+hh>vy+vh{
  return nil,ww,hh,"partly-off-screen",focused,visible,minimized
 }
 screen,_,_:=getDC.Call(0)
 if screen==0{return nil,ww,hh,"screen-dc-error",focused,visible,minimized}
 defer releaseDC.Call(0,screen)
 dest,_,_:=createDC.Call(screen)
 if dest==0{return nil,ww,hh,"memory-dc-error",focused,visible,minimized}
 defer deleteDC.Call(dest)
 info:=bmi{Header:bmiHeader{Size:uint32(unsafe.Sizeof(bmiHeader{})),Width:w,Height:-h,Planes:1,BitCount:32}}
 var ptr uintptr
 bitmap,_,_:=createDIB.Call(screen,uintptr(unsafe.Pointer(&info)),0,uintptr(unsafe.Pointer(&ptr)),0,0)
 if bitmap==0||ptr==0{return nil,ww,hh,"dib-error",focused,visible,minimized}
 defer deleteObject.Call(bitmap)
 previous,_,_:=selectObject.Call(dest,bitmap)
 if previous==0||previous==^uintptr(0){return nil,ww,hh,"select-error",focused,visible,minimized}
 defer selectObject.Call(dest,previous)
 setMode.Call(dest,3) // COLORONCOLOR: stable small raster
 if !yes(stretch,dest,0,0,w,h,screen,uintptr(int64(xy.X)),uintptr(int64(xy.Y)),
  uintptr(ww),uintptr(hh),0x00CC0020){
  return nil,ww,hh,"desktop-blt-error",focused,visible,minimized
 }
 raw:=unsafe.Slice((*byte)(unsafe.Pointer(ptr)),w*h*4)
 out:=make([]byte,len(raw))
 copy(out,raw)
 return out,ww,hh,"",focused,visible,minimized
}
func hashes(p []byte)(string,int){
 if len(p)!=w*h*4{return "",0}
 parts:=make([]string,0,8)
 for row:=0;row<3;row++{
  for col:=0;col<3;col++{
   if row==2&&col==2{continue} // Ignore the diagnostic clock.
   hasher:=fnv.New64a()
   x0,x1:=col*w/3,(col+1)*w/3
   for y:=row*h/3;y<(row+1)*h/3;y++{
    _,_=hasher.Write(p[4*(y*w+x0):4*(y*w+x1)])
   }
   parts=append(parts,fmt.Sprintf("%016x",hasher.Sum64()))
  }
 }
 colors:=map[uint16]struct{}{}
 for y:=0;y<h;y+=3{for x:=0;x<w;x+=3{
  i:=4*(y*w+x)
  b,g,r:=p[i],p[i+1],p[i+2]
  colors[uint16(r>>4)<<8|uint16(g>>4)<<4|uint16(b>>4)]=struct{}{}
 }}
 return strings.Join(parts,","),len(colors)
}
func main(){
 if len(os.Args)!=2{os.Exit(2)}
 handle,err:=strconv.ParseUint(os.Args[1],10,64)
 if err!=nil||handle==0{os.Exit(2)}
 if !yes(setDpi,^uintptr(3)){setDpiOld.Call()} // Per-monitor DPI v2, fallback
 go func(){_,_=io.Copy(io.Discard,os.Stdin);os.Exit(0)}() // Parent exit closes pipe
 encoder:=json.NewEncoder(os.Stdout)
 tick:=time.NewTicker(time.Second);defer tick.Stop()
 end:=time.After(4*time.Minute)
 var prev string
 var centerAt int64
 for{
  started:=time.Now()
  s:=sample{Type:"desktop.sample",At:started.UnixMilli(),ChangedRegions:-1,CenterAgeMs:-1}
  pixels,ww,hh,reason,focused,visible,minimized:=capture(uintptr(handle))
  s.Width=ww;s.Height=hh;s.Foreground=focused;s.Visible=visible;s.Minimized=minimized
  s.Reason=reason
  if reason==""{
   regions,bins:=hashes(pixels);s.ColorBins=bins
   if bins<8{s.Reason="low-color-diversity"
   }else{
    s.Valid=true;s.Regions=regions
    if prev!=""{
     a,b:=strings.Split(prev,","),strings.Split(regions,",")
     if len(a)==len(b){
      s.ChangedRegions=0
      for i:=range a{if a[i]!=b[i]{
       s.ChangedRegions++;if i==4{s.CenterChanged=true;centerAt=s.At}
      }}
     }
    }else{centerAt=s.At}
    if centerAt!=0{s.CenterAgeMs=s.At-centerAt}
    prev=regions
   }
  }
  if !s.Valid{prev="";centerAt=0}
  s.CaptureMs=time.Since(started).Milliseconds()
  if encoder.Encode(s)!=nil{return}
  select{case <-tick.C:case <-end:return}
 }
}
