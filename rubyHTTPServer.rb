require 'webrick'
include WEBrick

s = HTTPServer.new(:Port => 9090,  :DocumentRoot => Dir::pwd)
trap("INT"){ s.shutdown }
s.start
